import { Controller, Get, Query } from '@nestjs/common';
import { SearchShowsQueryDto, toShowSearchResultDto, type ShowSearchResultDto } from './search-shows.dto';
import { ShowsService } from './shows.service';

@Controller('shows')
export class ShowsController {
  constructor(private readonly shows: ShowsService) {}

  /** The Spotlight palette's live suggestions. No per-user state, no writes. */
  @Get('search')
  async search(@Query() query: SearchShowsQueryDto): Promise<ShowSearchResultDto[]> {
    const results = await this.shows.search(query.q);
    return results.map(toShowSearchResultDto);
  }
}
