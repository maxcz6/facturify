import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { UniformExceptionFilter } from './filters/uniform-exception.filter';
import { RequestIdMiddleware } from './middlewares/request-id.middleware';

@Module({
  providers: [RequestIdMiddleware, UniformExceptionFilter],
  exports: [RequestIdMiddleware, UniformExceptionFilter],
})
export class HttpSafetyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
