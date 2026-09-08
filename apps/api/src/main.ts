import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // The web app is served from its own origin (5173 in dev, a separate container in Compose),
  // so the API must opt in. `X-Acting-User-Id` is a custom header, which means it also has to
  // be allowed explicitly or the browser blocks every mutation at the preflight.
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    allowedHeaders: ['content-type', 'x-acting-user-id'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  const config = new DocumentBuilder()
    .setTitle('Ticket Tracker API')
    .setDescription('Multi-project ticket/issue tracker API')
    .setVersion('0.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
