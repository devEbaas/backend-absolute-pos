import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../package.json') as { version: string };

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // pos-root-dashboard es un SPA servido desde un origen distinto (no hay
  // reverse proxy compartido) — sin esto, cualquier fetch desde el
  // navegador falla en preflight. DASHBOARD_ORIGINS: lista separada por
  // comas (ej. "https://dashboard.tu-dominio.com,http://localhost:5174").
  // MARKETING_ORIGINS: mismo mecanismo para el sitio público
  // (absolute-systems-web), que llama POST /demo-requests sin auth desde el
  // navegador. Sin ninguna de las dos variables, CORS queda deshabilitado
  // (comportamiento previo).
  const parseOrigins = (value: string | undefined) =>
    (value ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  const allowedOrigins = [
    ...parseOrigins(process.env.DASHBOARD_ORIGINS),
    ...parseOrigins(process.env.MARKETING_ORIGINS),
  ];
  if (allowedOrigins.length > 0) {
    app.enableCors({ origin: allowedOrigins });
  }

  configureApp(app);

  const config = new DocumentBuilder()
    .setTitle('Absolute POS — Cloud API')
    .setDescription(
      'Backend remoto: sincronización, estadísticas y administración multi-sucursal para Absolute POS.',
    )
    .setVersion(version)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        description: 'Device API key o master key',
      },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
