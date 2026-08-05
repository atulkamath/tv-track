-- CreateTable
CREATE TABLE "shows" (
    "id" UUID NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "first_air_year" INTEGER,
    "poster_path" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "show_id" UUID NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "season_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "episode_number" INTEGER NOT NULL,
    "runtime_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shows_tmdb_id_key" ON "shows"("tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_tmdb_id_key" ON "seasons"("tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_show_id_season_number_key" ON "seasons"("show_id", "season_number");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_tmdb_id_key" ON "episodes"("tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_season_id_episode_number_key" ON "episodes"("season_id", "episode_number");

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "shows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
