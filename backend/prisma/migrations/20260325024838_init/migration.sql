-- CreateTable
CREATE TABLE "Researcher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT,
    "lastName" TEXT,
    "nameCN" TEXT,
    "email" TEXT,
    "currentCompany" TEXT,
    "jobTitle" TEXT,
    "team" TEXT,
    "researchAreas" TEXT,
    "seniority" TEXT,
    "education" TEXT,
    "previousCompanies" TEXT,
    "yearsAtCurrent" INTEGER,
    "googleScholar" TEXT,
    "github" TEXT,
    "linkedin" TEXT,
    "maimai" TEXT,
    "openreview" TEXT,
    "homepage" TEXT,
    "contact" TEXT,
    "status" TEXT NOT NULL DEFAULT '未接触',
    "priority" TEXT NOT NULL DEFAULT '中',
    "notes" TEXT,
    "sourceUrl" TEXT,
    "dedupeKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Paper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "venue" TEXT,
    "year" INTEGER,
    "abstract" TEXT,
    "directionTags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ResearcherPaper" (
    "researcherId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,

    PRIMARY KEY ("researcherId", "paperId"),
    CONSTRAINT "ResearcherPaper_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResearcherPaper_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "researchersFound" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Researcher_dedupeKey_key" ON "Researcher"("dedupeKey");

-- CreateIndex
CREATE INDEX "Researcher_currentCompany_idx" ON "Researcher"("currentCompany");

-- CreateIndex
CREATE INDEX "Researcher_status_idx" ON "Researcher"("status");

-- CreateIndex
CREATE INDEX "Researcher_priority_idx" ON "Researcher"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "Paper_url_key" ON "Paper"("url");
