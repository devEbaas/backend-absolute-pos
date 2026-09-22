import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { businessError } from '../common/business-error';
import { round2 } from '../common/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePaymentMethod } from '../common/payment-method.util';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CreateCashOutflowDto } from './dto/create-cash-outflow.dto';
import { CloseWithCutDto } from './dto/close-with-cut.dto';
import type { MobileAuthPayload } from '../common/guards/jwt-auth.guard';
import { mobileRegisterId } from '../common/register-id.util';
import {
  toCashCutDto,
  toCashOutflowDto,
  toCashSessionDto,
} from './cash.mappers';

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  // — Lecturas para el cajero (specs/22 §3.4) —
  //
  // Todas son **propias**: la sesión debe ser del usuario y del dispositivo del token (decisión 7 del README: así solo se
  // muestran filas escritas por el móvil, con fecha en UTC real). Lo que no es propio responde 404, no 403: no se
  // revela que existe.

  async currentSession(auth: MobileAuthPayload) {
    const row = await this.prisma.cashSession.findFirst({
      where: {
        businessId: auth.businessId,
        userId: auth.userId,
        deviceId: auth.deviceId,
        status: 'open',
      },
      orderBy: { openedAt: 'desc' },
      include: { user: { select: { name: true } } },
    });
    return { session: row ? toCashSessionDto(row) : null };
  }

  async ownSessionOrThrow(auth: MobileAuthPayload, sessionId: string) {
    const row = await this.prisma.cashSession.findFirst({
      where: {
        id: sessionId,
        businessId: auth.businessId,
        userId: auth.userId,
        deviceId: auth.deviceId,
      },
      include: { user: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException('Sesión no encontrada');
    return row;
  }

  async summary(auth: MobileAuthPayload, sessionId: string) {
    await this.ownSessionOrThrow(auth, sessionId);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { session, ...summary } = await this.computeTotals(
      auth.businessId,
      sessionId,
    );
    return summary;
  }

  async outflows(auth: MobileAuthPayload, sessionId: string) {
    await this.ownSessionOrThrow(auth, sessionId);
    const rows = await this.prisma.cashOutflow.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    });
    return rows.map(toCashOutflowDto);
  }

  async sales(auth: MobileAuthPayload, sessionId: string) {
    await this.ownSessionOrThrow(auth, sessionId);
    const rows = await this.prisma.sale.findMany({
      where: { businessId: auth.businessId, sessionId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      total: Number(row.total),
      paymentMethod: row.paymentMethod,
      cancelled: row.cancelled,
      createdAt: row.createdAt.toISOString(),
      itemsCount: row._count.items,
    }));
  }

  /** Los cortes **propios**: del usuario del token y de una sesión abierta en el dispositivo del token. */
  async cutsPage(auth: MobileAuthPayload, page = 1, pageSize = 15) {
    const where = {
      userId: auth.userId,
      session: { businessId: auth.businessId, deviceId: auth.deviceId },
    };
    const [total, rows] = await Promise.all([
      this.prisma.cashCut.count({ where }),
      this.prisma.cashCut.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true } }, session: true },
      }),
    ]);
    return { items: rows.map(toCashCutDto), page, pageSize, total };
  }

  // — Escrituras móviles (specs/22 §4.2, §4.3) —
  //
  // Cada una es UNA transacción que escribe su fila y su `sync_log` directamente (como `SalesService`): el corte
  // necesita ser multi-fila y atómico, y las demás usan el mismo camino para tener un solo criterio.

  async openSession(auth: MobileAuthPayload, dto: OpenCashSessionDto) {
    try {
      return await this.prisma.$transaction(
        (tx) => this.openSessionInTx(tx, auth, dto),
        { timeout: 15_000 },
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        const replay = await this.replaySession(this.prisma, auth, dto.id);
        if (replay) return replay;
      }
      throw e;
    }
  }

  private async openSessionInTx(
    tx: Prisma.TransactionClient,
    auth: MobileAuthPayload,
    dto: OpenCashSessionDto,
  ) {
    const { businessId, userId, deviceId } = auth;
    const replay = await this.replaySession(tx, auth, dto.id);
    if (replay) return replay;

    // "Una sesión abierta por (dispositivo, usuario)" (03 §2.2, C7). Dos aperturas simultáneas verían las dos "no hay
    // ninguna": el candado de aplicación las serializa por (usuario, dispositivo).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cash-open:${userId}:${deviceId}`}, 0))`;
    const open = await tx.cashSession.findFirst({
      where: { businessId, userId, deviceId, status: 'open' },
    });
    if (open) {
      throw businessError(
        HttpStatus.CONFLICT,
        'Ya tienes una sesión de caja abierta. Ciérrala antes de abrir una nueva.',
        'SESSION_ALREADY_OPEN',
      );
    }

    // `registerId` = nombre con el que se emparejó el dispositivo + un sufijo de su id (specs/22 §3.1, D4; ver
    // `mobileRegisterId`: sin el sufijo podría coincidir con la caja de un escritorio). Se lee aquí y no del JWT, que
    // solo trae `deviceId`: así renombrar el dispositivo surte efecto sin volver a iniciar sesión.
    const device = await tx.device.findFirstOrThrow({
      where: { id: deviceId, businessId },
      select: { id: true, label: true },
    });

    const now = new Date();
    const row = await tx.cashSession.create({
      data: {
        id: dto.id,
        businessId,
        userId,
        deviceId,
        openingAmount: round2(dto.openingAmount),
        status: 'open',
        registerId: mobileRegisterId(device),
        openedAt: now,
        updatedAt: now,
      },
      include: { user: { select: { name: true } } },
    });
    await tx.syncLogEntry.create({
      data: { businessId, tableName: 'cashSessions', rowId: row.id },
    });
    return toCashSessionDto(row);
  }

  private async replaySession(
    db: Pick<Prisma.TransactionClient, 'cashSession'>,
    auth: MobileAuthPayload,
    id: string,
  ) {
    const existing = await db.cashSession.findUnique({
      where: { id },
      include: { user: { select: { name: true } } },
    });
    if (!existing) return null;
    if (
      existing.businessId !== auth.businessId ||
      existing.userId !== auth.userId
    ) {
      throw idInUse();
    }
    return toCashSessionDto(existing);
  }

  async createOutflow(auth: MobileAuthPayload, dto: CreateCashOutflowDto) {
    try {
      return await this.prisma.$transaction(
        (tx) => this.createOutflowInTx(tx, auth, dto),
        { timeout: 15_000 },
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        const replay = await this.replayOutflow(this.prisma, auth, dto.id);
        if (replay) return replay;
      }
      throw e;
    }
  }

  private async createOutflowInTx(
    tx: Prisma.TransactionClient,
    auth: MobileAuthPayload,
    dto: CreateCashOutflowDto,
  ) {
    const { businessId, userId, deviceId } = auth;
    const replay = await this.replayOutflow(tx, auth, dto.id);
    if (replay) return replay;

    // Orden de las reglas (03 §2.3): la sesión, luego que esté abierta, luego el monto y el motivo.
    const owned = await tx.cashSession.findFirst({
      where: { id: dto.sessionId, businessId, userId, deviceId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Sesión no encontrada');
    // Con la fila de la sesión bloqueada en modo compartido, un corte que la cierre a la vez espera a esta salida (y no
    // deja una salida fuera del corte).
    await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${dto.sessionId}::uuid FOR SHARE`;
    const session = await tx.cashSession.findUniqueOrThrow({
      where: { id: dto.sessionId },
    });
    if (session.status !== 'open') {
      throw businessError(
        HttpStatus.CONFLICT,
        'La sesión ya está cerrada',
        'SESSION_CLOSED',
      );
    }
    if (
      typeof dto.amount !== 'number' ||
      !Number.isFinite(dto.amount) ||
      dto.amount <= 0
    ) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }
    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (reason === '')
      throw new BadRequestException('El motivo es obligatorio');

    const row = await tx.cashOutflow.create({
      data: {
        id: dto.id,
        sessionId: dto.sessionId,
        userId,
        amount: round2(dto.amount),
        reason,
        createdAt: new Date(),
      },
      include: { user: { select: { name: true } } },
    });
    await tx.syncLogEntry.create({
      data: { businessId, tableName: 'cashOutflows', rowId: row.id },
    });
    return toCashOutflowDto(row);
  }

  private async replayOutflow(
    db: Pick<Prisma.TransactionClient, 'cashOutflow' | 'cashSession'>,
    auth: MobileAuthPayload,
    id: string,
  ) {
    const existing = await db.cashOutflow.findUnique({
      where: { id },
      include: { user: { select: { name: true } }, session: true },
    });
    if (!existing) return null;
    if (
      existing.session.businessId !== auth.businessId ||
      existing.userId !== auth.userId
    ) {
      throw idInUse();
    }
    return toCashOutflowDto(existing);
  }

  // specs/22 §4.3 — corte y cierre en UNA transacción (03 §2.4); sustituye a `POST /cash-cuts` + `PATCH …/close`.
  async closeWithCut(
    auth: MobileAuthPayload,
    sessionId: string,
    dto: CloseWithCutDto,
  ) {
    try {
      return await this.prisma.$transaction(
        (tx) => this.closeWithCutInTx(tx, auth, sessionId, dto),
        { timeout: 15_000 },
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        const replay = await this.replayCut(this.prisma, auth, dto.id);
        if (replay) return replay;
      }
      throw e;
    }
  }

  private async closeWithCutInTx(
    tx: Prisma.TransactionClient,
    auth: MobileAuthPayload,
    sessionId: string,
    dto: CloseWithCutDto,
  ) {
    const { businessId, userId, deviceId } = auth;
    const replay = await this.replayCut(tx, auth, dto.id);
    if (replay) return replay;

    // 1. La sesión: del negocio y de este dispositivo. Se bloquea la fila (modo exclusivo): las ventas y salidas en curso
    //    (que la toman en modo compartido) terminan antes, y las nuevas esperan y ven la sesión cerrada.
    const found = await tx.cashSession.findFirst({
      where: { id: sessionId, businessId, deviceId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Sesión no encontrada');
    await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
    const session = await tx.cashSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    // 2. Ya cerrada: si tiene su corte, éxito idempotente (un reintento tras perder la respuesta no falla, CAJ-9) —
    //    pero solo para quien la abrió; sin corte no hay nada que devolver.
    if (session.status !== 'open') {
      const cut = await tx.cashCut.findFirst({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } }, session: true },
      });
      if (!cut) {
        throw businessError(
          HttpStatus.CONFLICT,
          'La sesión ya está cerrada',
          'SESSION_CLOSED',
        );
      }
      if (session.userId !== userId) throw notSessionOwner();
      return {
        cut: toCashCutDto(cut),
        session: toCashSessionDto({ ...cut.session, user: cut.user }),
      };
    }

    // 3. Solo quien abrió la caja puede cerrarla (C4).
    if (session.userId !== userId) throw notSessionOwner();

    // 4. El resumen SE RECALCULA aquí: el cliente solo manda lo contado y las notas, nunca los totales (03 §2.4).
    const totals = await this.computeTotals(businessId, sessionId, tx);
    const actualCash = dto.actualCash == null ? null : round2(dto.actualCash);
    const now = new Date();
    const notes = dto.notes?.trim() ? dto.notes.trim() : null;

    const cut = await tx.cashCut.create({
      data: {
        id: dto.id,
        sessionId,
        userId,
        cutType: 'total',
        openingAmount: totals.openingAmount,
        totalCashSales: totals.totalCashSales,
        totalCardSales: totals.totalCardSales,
        totalTransferSales: totals.totalTransferSales,
        totalOtherSales: totals.totalOtherSales,
        totalSales: totals.totalSales,
        totalCancelledAmount: totals.totalCancelledAmount,
        cancelledCount: totals.cancelledCount,
        expectedCash: totals.expectedCash,
        actualCash,
        cashDifference:
          actualCash === null ? null : round2(actualCash - totals.expectedCash),
        transactionCount: totals.transactionCount,
        totalOutflows: totals.totalOutflows,
        outflowCount: totals.outflowCount,
        notes,
        createdAt: now,
      },
      include: { user: { select: { name: true } } },
    });
    const closed = await tx.cashSession.update({
      where: { id: sessionId },
      data: { status: 'closed', closedAt: now, updatedAt: now },
      include: { user: { select: { name: true } } },
    });
    await tx.syncLogEntry.createMany({
      data: [
        { businessId, tableName: 'cashCuts', rowId: cut.id },
        { businessId, tableName: 'cashSessions', rowId: sessionId },
      ],
    });
    return {
      cut: toCashCutDto({ ...cut, session: closed }),
      session: toCashSessionDto(closed),
    };
  }

  private async replayCut(
    db: Pick<Prisma.TransactionClient, 'cashCut'>,
    auth: MobileAuthPayload,
    id: string,
  ) {
    const existing = await db.cashCut.findUnique({
      where: { id },
      include: { user: { select: { name: true } }, session: true },
    });
    if (!existing) return null;
    if (
      existing.session.businessId !== auth.businessId ||
      existing.userId !== auth.userId
    ) {
      throw idInUse();
    }
    return {
      cut: toCashCutDto(existing),
      session: toCashSessionDto({ ...existing.session, user: existing.user }),
    };
  }

  // Mirrors absolute-electron-pos's calcSessionSummary (src/main/ipc/cash.ipc.js)
  // so cuts reconcile the same way on both sides: totals bucketed by
  // payment method, cancelled sales tracked separately (never counted in
  // totalSales), expectedCash = openingAmount + cash sales - outflows.
  // Computed server-side from Sale/CashOutflow rather than trusted from the
  // client — the mobile app only supplies the physically-counted actualCash.
  private async computeTotals(
    businessId: string,
    sessionId: string,
    db: Pick<
      Prisma.TransactionClient,
      'cashSession' | 'sale' | 'cashOutflow'
    > = this.prisma,
  ) {
    const session = await db.cashSession.findFirst({
      where: { businessId, id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }

    const sales = await db.sale.findMany({
      where: { businessId, sessionId, cancelled: false },
      select: { paymentMethod: true, total: true },
    });

    let totalCashSales = 0;
    let totalCardSales = 0;
    let totalTransferSales = 0;
    let totalOtherSales = 0;
    for (const sale of sales) {
      const bucket = normalizePaymentMethod(sale.paymentMethod);
      const amount = Number(sale.total);
      if (bucket === 'cash') totalCashSales += amount;
      else if (bucket === 'card') totalCardSales += amount;
      else if (bucket === 'transfer') totalTransferSales += amount;
      else totalOtherSales += amount;
    }
    const totalSales =
      totalCashSales + totalCardSales + totalTransferSales + totalOtherSales;

    const cancelled = await db.sale.aggregate({
      where: { businessId, sessionId, cancelled: true },
      _count: true,
      _sum: { total: true },
    });

    const outflows = await db.cashOutflow.aggregate({
      where: { sessionId },
      _count: true,
      _sum: { amount: true },
    });

    const openingAmount = Number(session.openingAmount);
    const totalOutflows = Number(outflows._sum.amount ?? 0);

    return {
      session,
      openingAmount,
      totalCashSales: round2(totalCashSales),
      totalCardSales: round2(totalCardSales),
      totalTransferSales: round2(totalTransferSales),
      totalOtherSales: round2(totalOtherSales),
      totalSales: round2(totalSales),
      totalCancelledAmount: Number(cancelled._sum.total ?? 0),
      cancelledCount: cancelled._count,
      transactionCount: sales.length,
      totalOutflows,
      outflowCount: outflows._count,
      expectedCash: round2(openingAmount + totalCashSales - totalOutflows),
    };
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}

function idInUse() {
  return businessError(
    HttpStatus.CONFLICT,
    'El identificador ya está en uso',
    'ID_IN_USE',
  );
}

function notSessionOwner() {
  return new ForbiddenException({
    statusCode: 403,
    message: 'Solo el usuario que abrió la caja puede cerrarla',
    error: 'Forbidden',
    code: 'NOT_SESSION_OWNER',
  });
}
