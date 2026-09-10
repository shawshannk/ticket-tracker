import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { Project, ProjectCreateDto } from '@ticket-tracker/shared';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { projectMembers, projects } from '../../db/schema';
import { isUniqueViolation } from '../../common/is-unique-violation';
import { toProject } from '../project.mapper';

export class CreateProjectCommand {
  constructor(
    readonly input: ProjectCreateDto,
    /** The creating admin, who becomes the project's first project-admin member. */
    readonly creatorId: string,
  ) {}
}

@CommandHandler(CreateProjectCommand)
export class CreateProjectHandler implements ICommandHandler<CreateProjectCommand, Project> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ input, creatorId }: CreateProjectCommand): Promise<Project> {
    try {
      // One transaction, because a project with no members would violate R18 the moment it
      // existed. A unique-prefix violation throws from inside and rolls both rows back, which is
      // the wanted behaviour here (contrast M16's revocation, where a rollback hid the write).
      const row = await this.db.transaction(async (tx) => {
        // nextTicketSeq starts at the schema default (1), so the first ticket is {PREFIX}-1.
        const [project] = await tx.insert(projects).values(input).returning();
        await tx
          .insert(projectMembers)
          .values({ projectId: project.id, userId: creatorId, role: 'admin', createdBy: creatorId });
        return project;
      });
      return toProject(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A project with key prefix ${input.keyPrefix} already exists`);
      }
      throw err;
    }
  }
}
