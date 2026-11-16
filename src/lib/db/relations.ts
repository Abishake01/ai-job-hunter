import { relations } from "drizzle-orm";
import * as s from "./schema";

export const jobsRelations = relations(s.jobs, ({ one, many }) => ({
  company: one(s.companies, { fields: [s.jobs.companyId], references: [s.companies.id] }),
  match: one(s.jobMatches, { fields: [s.jobs.id], references: [s.jobMatches.jobId] }),
  sources: many(s.jobSources),
  skills: many(s.jobSkills),
  recruiters: many(s.recruiters),
  outreach: many(s.emailOutreach),
}));
export const companiesRelations = relations(s.companies, ({ many }) => ({ jobs: many(s.jobs), recruiters: many(s.recruiters) }));
export const jobSourcesRelations = relations(s.jobSources, ({ one }) => ({ job: one(s.jobs, { fields: [s.jobSources.jobId], references: [s.jobs.id] }) }));
export const jobSkillsRelations = relations(s.jobSkills, ({ one }) => ({
  job: one(s.jobs, { fields: [s.jobSkills.jobId], references: [s.jobs.id] }),
  skill: one(s.skills, { fields: [s.jobSkills.skillId], references: [s.skills.id] }),
}));
export const recruitersRelations = relations(s.recruiters, ({ one, many }) => ({
  company: one(s.companies, { fields: [s.recruiters.companyId], references: [s.companies.id] }),
  job: one(s.jobs, { fields: [s.recruiters.jobId], references: [s.jobs.id] }),
  sources: many(s.recruiterSources),
}));
export const recruiterSourcesRelations = relations(s.recruiterSources, ({ one }) => ({ recruiter: one(s.recruiters, { fields: [s.recruiterSources.recruiterId], references: [s.recruiters.id] }) }));
export const jobMatchesRelations = relations(s.jobMatches, ({ one }) => ({ job: one(s.jobs, { fields: [s.jobMatches.jobId], references: [s.jobs.id] }) }));
export const emailOutreachRelations = relations(s.emailOutreach, ({ one }) => ({
  job: one(s.jobs, { fields: [s.emailOutreach.jobId], references: [s.jobs.id] }),
  recruiter: one(s.recruiters, { fields: [s.emailOutreach.recruiterId], references: [s.recruiters.id] }),
}));
