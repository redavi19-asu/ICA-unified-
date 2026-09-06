'use client';

import { ChangeEvent, useState } from 'react';
import styles from '../learning.module.css';

export default function StreamVideoUploader({
  courseId,
  onUploaded,
  onMessage,
}: {
  courseId: string;
  onUploaded: (mediaUrl: string) => void;
  onMessage: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function uploadVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      onMessage('Choose a video file for Stream upload.');
      event.target.value = '';
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      onMessage('This Stream-ready uploader currently supports videos up to 200 MB. Larger resumable uploads come with the paid video tier.');
      event.target.value = '';
      return;
    }

    setUploading(true);
    onMessage(`Preparing secure Stream upload for ${file.name}...`);

    try {
      const provision = await fetch('/api/stream/direct-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          fileName: file.name,
          fileSize: file.size,
          maxDurationSeconds: 4 * 60 * 60,
        }),
      });
      const setup = await provision.json();

      if (!provision.ok) {
        onMessage(setup.error || 'Cloudflare Stream video hosting is not enabled yet.');
        return;
      }

      onMessage(`Uploading ${file.name} directly to Cloudflare Stream...`);
      const payload = new FormData();
      payload.append('file', file);
      const upload = await fetch(setup.uploadURL, { method: 'POST', body: payload });

      if (!upload.ok) {
        onMessage('Cloudflare Stream could not accept the video upload.');
        return;
      }

      onUploaded(setup.mediaUrl);
      onMessage(`${file.name} uploaded to Stream. Add the lesson to attach the video.`);
    } catch {
      onMessage('Video hosting is wired, but Stream storage is not available on the current plan yet.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  return (
    <label className={styles.uploadBox}>
      <span>{uploading ? 'UPLOADING DIRECTLY TO CLOUDFLARE STREAM...' : 'UPLOAD TRAINING VIDEO TO STREAM'}</span>
      <input
        type="file"
        disabled={uploading}
        onChange={uploadVideo}
        accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/*"
      />
      <small>
        The browser uploads directly to Cloudflare Stream, not through the Unified server. The current direct-upload wiring supports files up to 200 MB; paid Stream storage can be enabled later.
      </small>
    </label>
  );
}
