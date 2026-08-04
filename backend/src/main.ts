import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(app.get(ConfigService).get<number>('PORT') ?? 3001);
}

void bootstrap();
