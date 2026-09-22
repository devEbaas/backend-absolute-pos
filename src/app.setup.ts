import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

// Configuración de la app que NO vive en un módulo y por eso hay que repetir en cada arranque: `main.ts` y las pruebas
// e2e la comparten para que una prueba valide exactamente lo mismo que producción (sobre todo `forbidNonWhitelisted`:
// un campo desconocido en un DTO tumba la petición con 400, ver specs/22 §1).
export function configureApp(app: INestApplication): void {
  // El worker de sync del desktop (absolute-pos-app/src/main/sync/realtime.js)
  // habla WebSocket plano (librería `ws`), no Socket.IO — este adapter expone
  // /ws con ese mismo protocolo.
  app.useWebSocketAdapter(new WsAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
}
