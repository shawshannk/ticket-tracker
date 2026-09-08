import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Project } from '@ticket-tracker/shared';
import { asc } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { projects } from '../../db/schema';
import { toProject } from '../project.mapper';

export class GetProjectsQuery {}

@QueryHandler(GetProjectsQuery)
export class GetProjectsHandler implements IQueryHandler<GetProjectsQuery, Project[]> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute(): Promise<Project[]> {
    const rows = await this.db.select().from(projects).orderBy(asc(projects.name));
    return rows.map(toProject);
  }
}
