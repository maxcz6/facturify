import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Document } from '@prisma/client';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Document registered with status PENDING.' })
  create(@Body() input: CreateDocumentDto): Promise<Document> {
    return this.documents.create(input);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Document state and calculated amounts.' })
  findOne(@Param('id') id: string): Promise<Document> {
    return this.documents.findOne(id);
  }
}
