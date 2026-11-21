-- CreateTable
CREATE TABLE "supplier_feed" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "url" TEXT NOT NULL,
    "dialect" VARCHAR(20) NOT NULL,
    "item_element" VARCHAR(200) NOT NULL,
    "mapping" JSONB NOT NULL,
    "import_interval_minutes" INTEGER,
    "next_import_at" TIMESTAMPTZ(6),
    "last_import_at" TIMESTAMPTZ(6),
    "last_import_status" VARCHAR(20),
    "last_import_error" TEXT,
    "last_import_stats" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "supplier_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_feed_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feed_id" UUID NOT NULL,
    "kod" VARCHAR(255) NOT NULL,
    "nazev" VARCHAR(255),
    "ean_kod" VARCHAR(64),
    "kod_vyrobce" VARCHAR(255),
    "vyrobce" VARCHAR(255),
    "popis" TEXT,
    "kratky_popis" TEXT,
    "cena_bezna" DECIMAL(20,6),
    "nakup_cena" DECIMAL(20,6),
    "szb_dph" DECIMAL(5,2),
    "sum_stav_mj" DECIMAL(18,6),
    "dodaci_lhuta" DECIMAL(10,2),
    "hmotnost_netto" DECIMAL(18,6),
    "kategorie" TEXT,
    "url" TEXT,
    "obrazky" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skupina_variant" VARCHAR(255),
    "atributy" JSONB NOT NULL DEFAULT '{}',
    "raw" JSONB NOT NULL,
    "cenik_id" UUID,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "supplier_feed_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_feed_url_uq" ON "supplier_feed"("url");

-- CreateIndex
CREATE INDEX "supplier_feed_next_import_idx" ON "supplier_feed"("next_import_at");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_feed_item_feed_kod_uq" ON "supplier_feed_item"("feed_id", "kod");

-- CreateIndex
CREATE INDEX "supplier_feed_item_ean_idx" ON "supplier_feed_item"("ean_kod");

-- CreateIndex
CREATE INDEX "supplier_feed_item_cenik_idx" ON "supplier_feed_item"("cenik_id");

-- AddForeignKey
ALTER TABLE "supplier_feed_item" ADD CONSTRAINT "supplier_feed_item_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "supplier_feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_feed_item" ADD CONSTRAINT "supplier_feed_item_cenik_id_fkey" FOREIGN KEY ("cenik_id") REFERENCES "flexi_cenik"("id") ON DELETE SET NULL ON UPDATE CASCADE;
