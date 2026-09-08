import { Inject, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Project } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { projects } from '../../db/schema';
import { toProject } from '../project.mapper';

export class GetProjectQuery {
  constructor(readonly id: string) {}
}

@QueryHandler(GetProjectQuery)
export class GetProjectHandler implements IQueryHandler<GetProjectQuery, Project> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ id }: GetProjectQuery): Promise<Project> {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!row) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return toProject(row);
  }
}
