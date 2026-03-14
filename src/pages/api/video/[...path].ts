import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { LIBRARY_ROOT } from '../../../lib/db';

function mimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.mp4':  'video/mp4',
    '.webm': 'video/webm',
    '.mkv':  'video/x-matroska',
    '.mov':  'video/quicktime',
    '.avi':  'video/x-msvideo',
    '.m4v':  'video/mp4',
    '.flv':  'video/x-flv',
    '.wmv':  'video/x-ms-wmv',
    '.ts':   'video/mp2t',
  };
  return map[ext] ?? 'application/octet-stream';
}

function nodeToWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      (nodeStream as Readable).destroy();
    },
  });
}

export const GET: APIRoute = ({ params, request }) => {
  // params.path = "Users/ignazioc/library/film.mp4" (leading slash stripped by Astro)
  const filePath = path.resolve('/' + (params['path'] ?? ''));

  // Reject any path that escapes the library root
  if (!filePath.startsWith(LIBRARY_ROOT)) {
    return new Response('Access denied', { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!stat.isFile()) {
    return new Response('Not a file', { status: 400 });
  }

  const fileSize = stat.size;
  const mime = mimeType(filePath);
  const rangeHeader = request.headers.get('range');

  if (!rangeHeader) {
    const stream = fs.createReadStream(filePath);
    return new Response(nodeToWebStream(stream), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
      },
    });
  }

  // Parse "bytes=start-end"
  const [, rangeValue] = rangeHeader.split('=');
  const [startStr, endStr] = rangeValue.split('-');
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

  if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileSize}` },
    });
  }

  const chunkSize = end - start + 1;
  const stream = fs.createReadStream(filePath, { start, end });

  return new Response(nodeToWebStream(stream), {
    status: 206,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(chunkSize),
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
    },
  });
};
