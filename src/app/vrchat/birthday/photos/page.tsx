"use client";

import { ArchiveError, Header, useArchive, type Album } from "../archive";
import { BirthdayGallery } from "../gallery";

export default function Photos() {
  const { data, failed } = useArchive<Album>("album");
  return <><Header title="PHOTO ZONE" /><div className="archive-inner album-inner">
    {data && <BirthdayGallery photos={data.photos} />}
    {failed && <ArchiveError />}
  </div></>;
}
