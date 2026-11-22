import { NestFactory } from '@nestjs/core';

import { loadEnv, serverEnv } from '@repo/core-config';

import { AppModule } from './app.module';

async function bootstrap() {
  const { PORT } = loadEnv(serverEnv);
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.enableShutdownHooks();
  await app.listen(PORT, '0.0.0.0');
}

void bootstrap();
