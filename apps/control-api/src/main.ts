import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { EnvelopeInterceptor, HttpErrorFilter } from "./common/http";

async function main() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Script Tools API")
      .setVersion("0.1.0")
      .addCookieAuth("session")
      .build(),
  );
  SwaggerModule.setup("api/docs", app, document);
  await app.listen(
    Number(process.env.API_PORT || 3001),
    process.env.HOST || "127.0.0.1",
  );
}
void main();
