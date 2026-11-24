BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS vrchat_gallery;

CREATE TABLE IF NOT EXISTS vrchat_gallery.media (
  id text PRIMARY KEY,
  request_id uuid UNIQUE,
  fingerprint text,
  type text NOT NULL CHECK (type IN ('photo', 'video')),
  alt text NOT NULL CHECK (char_length(alt) BETWEEN 1 AND 200),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  taken_on date,
  tags text[] NOT NULL DEFAULT '{}',
  mime text NOT NULL,
  static_src text,
  static_thumbnail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((request_id IS NULL AND fingerprint IS NULL AND static_src IS NOT NULL AND static_thumbnail IS NOT NULL)
      OR (request_id IS NOT NULL AND fingerprint IS NOT NULL AND static_src IS NULL AND static_thumbnail IS NULL))
);

ALTER TABLE vrchat_gallery.media ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

INSERT INTO vrchat_gallery.media (id,type,alt,width,height,taken_on,tags,mime,static_src,static_thumbnail)
VALUES
  ('sunset','photo','노을을 바라보는 언더리',2560,1440,'2026-11-13',ARRAY['배경','캐릭터'],
   'image/webp','/vrchat/assets/sunset.webp','/vrchat/assets/sunset-thumb.webp'),
  ('portrait','photo','검은 옷을 입고 브이 포즈를 한 언더리',1440,2560,NULL,ARRAY['캐릭터'],
   'image/png','/vrchat/assets/avatar.png','/vrchat/assets/avatar-thumb.webp')
ON CONFLICT (id) DO NOTHING;
COMMIT;
