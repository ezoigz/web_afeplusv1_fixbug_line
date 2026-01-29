/*
  Warnings:

  - You are about to drop the column `borrow_equipment` on the `borrowequipment_list` table. All the data in the column will be lost.
  - You are about to drop the column `borrow_equipment_number` on the `borrowequipment_list` table. All the data in the column will be lost.
  - Added the required column `equipment_id` to the `borrowequipment_list` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "borrowequipment_list" DROP COLUMN "borrow_equipment",
DROP COLUMN "borrow_equipment_number",
ADD COLUMN     "equipment_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "location" ADD COLUMN     "locat_noti_count" INTEGER DEFAULT 0,
ALTER COLUMN "locat_noti_status" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "equipment" (
    "equipment_id" SERIAL NOT NULL,
    "equipment_name" VARCHAR(255) NOT NULL,
    "equipment_code" VARCHAR(100) NOT NULL,
    "equipment_status" INTEGER NOT NULL DEFAULT 1,
    "equipment_create_date" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "equipment_update_date" TIMESTAMP(6),

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("equipment_id")
);

-- CreateTable
CREATE TABLE "fall_records" (
    "fall_id" SERIAL NOT NULL,
    "users_id" INTEGER NOT NULL,
    "takecare_id" INTEGER NOT NULL,
    "fall_timestamp" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "fall_latitude" VARCHAR(255) DEFAULT '0',
    "fall_longitude" VARCHAR(255) DEFAULT '0',
    "x_axis" DOUBLE PRECISION NOT NULL,
    "y_axis" DOUBLE PRECISION NOT NULL,
    "z_axis" DOUBLE PRECISION NOT NULL,
    "fall_status" INTEGER DEFAULT 0,
    "noti_time" TIMESTAMP(6),
    "noti_status" INTEGER,
    "noti_count" INTEGER DEFAULT 0,

    CONSTRAINT "fall_records_pkey" PRIMARY KEY ("fall_id")
);

-- CreateTable
CREATE TABLE "heartrate_records" (
    "heartrate_id" SERIAL NOT NULL,
    "users_id" INTEGER NOT NULL,
    "takecare_id" INTEGER NOT NULL,
    "bpm" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "status" INTEGER DEFAULT 1,
    "noti_time" TIMESTAMP(6),
    "noti_status" INTEGER,
    "record_date" DATE DEFAULT CURRENT_DATE,

    CONSTRAINT "heartrate_records_pkey" PRIMARY KEY ("heartrate_id")
);

-- CreateTable
CREATE TABLE "heartrate_settings" (
    "id" SERIAL NOT NULL,
    "users_id" INTEGER NOT NULL,
    "takecare_id" INTEGER NOT NULL,
    "max_bpm" INTEGER NOT NULL,
    "min_bpm" INTEGER NOT NULL,

    CONSTRAINT "heartrate_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temperature_records" (
    "temperature_id" SERIAL NOT NULL,
    "users_id" INTEGER NOT NULL,
    "takecare_id" INTEGER NOT NULL,
    "temperature_value" DOUBLE PRECISION NOT NULL,
    "record_date" DATE DEFAULT CURRENT_DATE,
    "status" INTEGER NOT NULL DEFAULT 0,
    "noti_time" TIMESTAMP(6),
    "noti_status" INTEGER,

    CONSTRAINT "temperature_records_pkey" PRIMARY KEY ("temperature_id")
);

-- CreateTable
CREATE TABLE "temperature_settings" (
    "setting_id" SERIAL NOT NULL,
    "users_id" INTEGER NOT NULL,
    "takecare_id" INTEGER NOT NULL,
    "max_temperature" DOUBLE PRECISION NOT NULL DEFAULT 37,

    CONSTRAINT "temperature_settings_pkey" PRIMARY KEY ("setting_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_equipment_code_key" ON "equipment"("equipment_code");

-- AddForeignKey
ALTER TABLE "borrowequipment_list" ADD CONSTRAINT "borrowequipment_list_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("equipment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fall_records" ADD CONSTRAINT "fk_takecare_fall_records" FOREIGN KEY ("takecare_id") REFERENCES "takecareperson"("takecare_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fall_records" ADD CONSTRAINT "fk_users_fall_records" FOREIGN KEY ("users_id") REFERENCES "users"("users_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heartrate_records" ADD CONSTRAINT "fk_takecareperson_hr" FOREIGN KEY ("takecare_id") REFERENCES "takecareperson"("takecare_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "heartrate_records" ADD CONSTRAINT "fk_users_hr" FOREIGN KEY ("users_id") REFERENCES "users"("users_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "heartrate_settings" ADD CONSTRAINT "fk_takecareperson_hrset" FOREIGN KEY ("takecare_id") REFERENCES "takecareperson"("takecare_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "heartrate_settings" ADD CONSTRAINT "fk_users_hrset" FOREIGN KEY ("users_id") REFERENCES "users"("users_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "temperature_records" ADD CONSTRAINT "fk_takecare_temperature_records" FOREIGN KEY ("takecare_id") REFERENCES "takecareperson"("takecare_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temperature_records" ADD CONSTRAINT "fk_users_temperature_records" FOREIGN KEY ("users_id") REFERENCES "users"("users_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temperature_settings" ADD CONSTRAINT "fk_takecare_temperature_settings" FOREIGN KEY ("takecare_id") REFERENCES "takecareperson"("takecare_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temperature_settings" ADD CONSTRAINT "fk_users_temperature_settings" FOREIGN KEY ("users_id") REFERENCES "users"("users_id") ON DELETE RESTRICT ON UPDATE CASCADE;
