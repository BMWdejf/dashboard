-- CreateTable
CREATE TABLE "flexi_skupina_zbozi" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kod" TEXT NOT NULL,
    "nazev" TEXT,

    CONSTRAINT "flexi_skupina_zbozi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_merna_jednotka" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kod" TEXT NOT NULL,
    "nazev" TEXT,

    CONSTRAINT "flexi_merna_jednotka_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_sklad" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kod" TEXT NOT NULL,
    "nazev" TEXT,

    CONSTRAINT "flexi_sklad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_ucetni_obdobi" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kod" TEXT NOT NULL,
    "popis" TEXT,
    "plati_od" DATE NOT NULL,
    "plati_do" DATE NOT NULL,

    CONSTRAINT "flexi_ucetni_obdobi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_adresar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kod" TEXT NOT NULL,
    "nazev" TEXT,
    "ic" TEXT,
    "dic" TEXT,

    CONSTRAINT "flexi_adresar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_cenik" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flexi_created_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "kod" TEXT NOT NULL,
    "nazev" VARCHAR(255) NOT NULL,
    "popis" TEXT,
    "kratky_popis" TEXT,
    "klic_slova" TEXT,
    "tech_param" TEXT,
    "ean_kod" TEXT,
    "typ_zasoby" TEXT NOT NULL,
    "skladove" BOOLEAN NOT NULL DEFAULT false,
    "export_na_eshop" BOOLEAN NOT NULL DEFAULT false,
    "skupina_zbozi_id" UUID,
    "mj1_id" UUID,
    "stitky" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "plati_od_rok" INTEGER,
    "plati_do_rok" INTEGER,
    "typ_ceny_dph" TEXT,
    "typ_sazby_dph" TEXT,
    "szb_dph" DECIMAL(5,2),
    "cena_zakl" DECIMAL(20,6),
    "cena_zakl_bez_dph" DECIMAL(20,6),
    "cena_zakl_vc_dph" DECIMAL(20,6),
    "cena_bezna" DECIMAL(20,6),
    "nakup_cena" DECIMAL(20,6),
    "sum_stav_mj" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "sum_dostup_mj" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "sum_rezer_mj" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "zaruka" INTEGER,
    "mj_zaruky" TEXT,
    "dodaci_lhuta" DECIMAL(10,2),
    "mj_dodaci_lhuty_id" UUID,
    "hmotnost_netto" DECIMAL(18,6),
    "mj_hmotnosti_id" UUID,
    "evid_sarze" BOOLEAN NOT NULL DEFAULT false,
    "evid_expirace" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,

    CONSTRAINT "flexi_cenik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_cenik_stav_historie" (
    "cenik_id" UUID NOT NULL,
    "plati_od" TIMESTAMPTZ(6) NOT NULL,
    "stav_mj" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "flexi_cenik_stav_historie_pkey" PRIMARY KEY ("cenik_id","plati_od")
);

-- CreateTable
CREATE TABLE "flexi_skladova_karta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cenik_id" UUID NOT NULL,
    "sklad_id" UUID NOT NULL,
    "ucetni_obdobi_id" UUID NOT NULL,
    "stav_mj" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "min_mj" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "max_mj" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "rezerv_mj" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "dostup_mj" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "flexi_skladova_karta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_typ_atributu" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kod" TEXT NOT NULL,
    "nazev" TEXT,
    "typ" TEXT,

    CONSTRAINT "flexi_typ_atributu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_cenik_atribut" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cenik_id" UUID NOT NULL,
    "typ_atributu_id" UUID NOT NULL,
    "hodnota" TEXT,
    "val_numeric" DECIMAL(24,6),
    "raw" JSONB,

    CONSTRAINT "flexi_cenik_atribut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_cenik_odberatel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cenik_id" UUID NOT NULL,
    "firma_id" UUID,
    "mena" VARCHAR(10),
    "prodej_cena" DECIMAL(20,6),
    "plati_od" DATE,
    "plati_do" DATE,
    "raw" JSONB,

    CONSTRAINT "flexi_cenik_odberatel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_cenik_dodavatel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cenik_id" UUID NOT NULL,
    "firma_id" UUID,
    "mena" VARCHAR(10),
    "nakup_cena" DECIMAL(20,6),
    "primarni" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,

    CONSTRAINT "flexi_cenik_dodavatel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_cenik_priloha" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flexi_id" INTEGER NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cenik_id" UUID NOT NULL,
    "nazev_souboru" TEXT,
    "content_type" TEXT,
    "typ" TEXT,
    "data_size" INTEGER,
    "data_hash" TEXT,
    "hlavni" BOOLEAN NOT NULL DEFAULT false,
    "odkaz" TEXT,
    "url" TEXT,

    CONSTRAINT "flexi_cenik_priloha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_sync_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "counts" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "flexi_sync_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flexi_sync_state" (
    "evidence" TEXT NOT NULL,
    "last_update" TIMESTAMPTZ(6),
    "changes_version" BIGINT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flexi_sync_state_pkey" PRIMARY KEY ("evidence")
);

-- CreateIndex
CREATE UNIQUE INDEX "flexi_skupina_zbozi_flexi_id_key" ON "flexi_skupina_zbozi"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_skupina_zbozi_kod_idx" ON "flexi_skupina_zbozi"("kod");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_merna_jednotka_flexi_id_key" ON "flexi_merna_jednotka"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_merna_jednotka_kod_idx" ON "flexi_merna_jednotka"("kod");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_sklad_flexi_id_key" ON "flexi_sklad"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_sklad_kod_idx" ON "flexi_sklad"("kod");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_ucetni_obdobi_flexi_id_key" ON "flexi_ucetni_obdobi"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_ucetni_obdobi_kod_idx" ON "flexi_ucetni_obdobi"("kod");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_adresar_flexi_id_key" ON "flexi_adresar"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_adresar_ic_idx" ON "flexi_adresar"("ic");

-- CreateIndex
CREATE INDEX "flexi_adresar_kod_idx" ON "flexi_adresar"("kod");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_cenik_flexi_id_key" ON "flexi_cenik"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_cenik_ean_idx" ON "flexi_cenik"("ean_kod");

-- CreateIndex
CREATE INDEX "flexi_cenik_skupina_idx" ON "flexi_cenik"("skupina_zbozi_id");

-- CreateIndex
CREATE INDEX "flexi_cenik_nazev_idx" ON "flexi_cenik"("nazev");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_cenik_kod_uq" ON "flexi_cenik"("kod");

-- CreateIndex
CREATE INDEX "flexi_cenik_stav_historie_plati_od_idx" ON "flexi_cenik_stav_historie"("plati_od");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_skladova_karta_flexi_id_key" ON "flexi_skladova_karta"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_skladova_karta_sklad_idx" ON "flexi_skladova_karta"("sklad_id", "ucetni_obdobi_id");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_skladova_karta_uq" ON "flexi_skladova_karta"("cenik_id", "sklad_id", "ucetni_obdobi_id");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_typ_atributu_flexi_id_key" ON "flexi_typ_atributu"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_typ_atributu_kod_idx" ON "flexi_typ_atributu"("kod");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_cenik_atribut_flexi_id_key" ON "flexi_cenik_atribut"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_cenik_atribut_cenik_idx" ON "flexi_cenik_atribut"("cenik_id", "typ_atributu_id");

-- CreateIndex
CREATE INDEX "flexi_cenik_atribut_typ_hodnota_idx" ON "flexi_cenik_atribut"("typ_atributu_id", "hodnota");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_cenik_odberatel_flexi_id_key" ON "flexi_cenik_odberatel"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_cenik_odberatel_firma_cenik_idx" ON "flexi_cenik_odberatel"("firma_id", "cenik_id");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_cenik_dodavatel_flexi_id_key" ON "flexi_cenik_dodavatel"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_cenik_dodavatel_firma_cenik_idx" ON "flexi_cenik_dodavatel"("firma_id", "cenik_id");

-- CreateIndex
CREATE UNIQUE INDEX "flexi_cenik_priloha_flexi_id_key" ON "flexi_cenik_priloha"("flexi_id");

-- CreateIndex
CREATE INDEX "flexi_cenik_priloha_cenik_idx" ON "flexi_cenik_priloha"("cenik_id");

-- CreateIndex
CREATE INDEX "flexi_sync_run_started_idx" ON "flexi_sync_run"("started_at");

-- AddForeignKey
ALTER TABLE "flexi_cenik" ADD CONSTRAINT "flexi_cenik_skupina_zbozi_id_fkey" FOREIGN KEY ("skupina_zbozi_id") REFERENCES "flexi_skupina_zbozi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik" ADD CONSTRAINT "flexi_cenik_mj1_id_fkey" FOREIGN KEY ("mj1_id") REFERENCES "flexi_merna_jednotka"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik" ADD CONSTRAINT "flexi_cenik_mj_hmotnosti_id_fkey" FOREIGN KEY ("mj_hmotnosti_id") REFERENCES "flexi_merna_jednotka"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik" ADD CONSTRAINT "flexi_cenik_mj_dodaci_lhuty_id_fkey" FOREIGN KEY ("mj_dodaci_lhuty_id") REFERENCES "flexi_merna_jednotka"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik_stav_historie" ADD CONSTRAINT "flexi_cenik_stav_historie_cenik_id_fkey" FOREIGN KEY ("cenik_id") REFERENCES "flexi_cenik"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_skladova_karta" ADD CONSTRAINT "flexi_skladova_karta_cenik_id_fkey" FOREIGN KEY ("cenik_id") REFERENCES "flexi_cenik"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_skladova_karta" ADD CONSTRAINT "flexi_skladova_karta_sklad_id_fkey" FOREIGN KEY ("sklad_id") REFERENCES "flexi_sklad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_skladova_karta" ADD CONSTRAINT "flexi_skladova_karta_ucetni_obdobi_id_fkey" FOREIGN KEY ("ucetni_obdobi_id") REFERENCES "flexi_ucetni_obdobi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik_atribut" ADD CONSTRAINT "flexi_cenik_atribut_cenik_id_fkey" FOREIGN KEY ("cenik_id") REFERENCES "flexi_cenik"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik_atribut" ADD CONSTRAINT "flexi_cenik_atribut_typ_atributu_id_fkey" FOREIGN KEY ("typ_atributu_id") REFERENCES "flexi_typ_atributu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik_odberatel" ADD CONSTRAINT "flexi_cenik_odberatel_cenik_id_fkey" FOREIGN KEY ("cenik_id") REFERENCES "flexi_cenik"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik_odberatel" ADD CONSTRAINT "flexi_cenik_odberatel_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "flexi_adresar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik_dodavatel" ADD CONSTRAINT "flexi_cenik_dodavatel_cenik_id_fkey" FOREIGN KEY ("cenik_id") REFERENCES "flexi_cenik"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik_dodavatel" ADD CONSTRAINT "flexi_cenik_dodavatel_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "flexi_adresar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flexi_cenik_priloha" ADD CONSTRAINT "flexi_cenik_priloha_cenik_id_fkey" FOREIGN KEY ("cenik_id") REFERENCES "flexi_cenik"("id") ON DELETE CASCADE ON UPDATE CASCADE;
