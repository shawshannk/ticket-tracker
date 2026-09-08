import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { Project, ProjectCreateDto } from '@ticket-tracker/shared';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { projects } from '../../db/schema';
import { isUniqueViolation } from '../../common/is-unique-violation';
import { toProject } from '../project.mapper';

export class CreateProjectCommand {
  constructor(readonly input: ProjectCreateDto) {}
}

@CommandHandler(CreateProjectCommand)
export class CreateProjectHandler implements ICommandHandler<CreateProjectCommand, Project> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ input }: CreateProjectCommand): Promise<Project> {
    try {
      // nextTicketSeq starts at the schema default (1), so the first ticket is {PREFIX}-1.
      const [row] = await this.db.insert(projects).values(input).returning();
      return toProject(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A project with key prefix ${input.keyPrefix} already exists`);
      }
      throw err;
    }
  }
}
