import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHome() {
    return {
      message: 'Kiaan Freight Services KFS API is running successfully!',
      status: 'OK',
    };
  }
}