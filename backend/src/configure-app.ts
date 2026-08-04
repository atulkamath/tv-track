import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Everything that makes the app behave the way it does in production, applied
 * in one place so tests boot the *same* app rather than a differently
 * configured one. Without this, a route's validation rules would hold in
 * production and quietly not exist under test.
 */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService);

  // The frontend is a separate deployment (ADR 0004), so it reaches this API
  // cross-origin and sends the Clerk token on every request.
  app.enableCors({
    origin: config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  return app;
}
