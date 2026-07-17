import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../package.json') as { version: string };

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
