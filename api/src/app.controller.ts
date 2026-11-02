import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHome() {
    return {
      message: 'Kiaan Enterprises API is running successfully!',
      status: 'OK',
    };
  }
}