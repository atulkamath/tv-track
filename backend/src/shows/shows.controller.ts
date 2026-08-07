import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateShowDto } from './create-show.dto';
import { SearchShowsQueryDto, toShowSearchResultDto, type ShowSearchResultDto } from './search-shows.dto';
import type { ShowCardDto, ShowDetailDto } from './show.dto';
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

  /** Adds (or re-adds) a show, mirroring it from TMDB the first time it's ever added by anyone. */
  @Post()
  async create(@CurrentUser() user: User, @Body() body: CreateShowDto): Promise<ShowCardDto> {
    return this.shows.addShow(user, body);
  }

  /** The caller's home list: every show they've watched at least one episode of. */
  @Get()
  async list(@CurrentUser() user: User): Promise<ShowCardDto[]> {
    return this.shows.listShows(user);
  }

  /** The full season/episode tree behind one show's accordion. */
  @Get(':id')
  async detail(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShowDetailDto> {
    return this.shows.getShowDetail(user, id);
  }
}
