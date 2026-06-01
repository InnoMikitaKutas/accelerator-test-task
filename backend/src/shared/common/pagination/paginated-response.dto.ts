import { ApiProperty } from '@nestjs/swagger';
import { Type } from '@nestjs/common';

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Swagger mixin: `PaginatedResponseDto(ItemDto)` produces a typed schema with `items: ItemDto[]`.
 * Use with `@ApiOkResponse({ type: PaginatedResponseDto(ItemDto) })`.
 */
export function PaginatedResponseDto<T>(itemType: Type<T>): Type<Paginated<T>> {
  class PaginatedHost implements Paginated<T> {
    @ApiProperty({ type: itemType, isArray: true })
    items: T[];

    @ApiProperty({ nullable: true, description: 'Opaque cursor for the next page; null at end' })
    nextCursor: string | null;

    @ApiProperty()
    hasMore: boolean;
  }
  Object.defineProperty(PaginatedHost, 'name', { value: `Paginated${itemType.name}` });
  return PaginatedHost;
}
