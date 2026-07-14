import { useState, useEffect } from 'react';

interface Props {
  cid: string;
}

// MIME type helpers
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];

function fileTypeFromExt(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

export default function FileCard({ cid }: Props) {
  const [info, setInfo] = useState<{ name?: string; size?: number; mimeType?: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Try to get file info from IPFS API
    fetch(`/api/ipfs/file/${cid}`, { method: 'HEAD' })
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        const mime = r.headers.get('content-type') || '';
        const len = r.headers.get('content-length');
        const disp = r.headers.get('content-disposition') || '';
        const nameMatch = disp.match(/filename="?(.+?)"?$/);
        setInfo({
          name: nameMatch?.[1] || 'file',
          size: len ? parseInt(len) : undefined,
          mimeType: mime,
        });
      })
      .catch(() => {
        // Fallback: try to get from CID pattern
        setInfo({ name: cid });
      });
  }, [cid]);

  const url = `/api/ipfs/file/${cid}`;
  const mime = info?.mimeType || fileTypeFromExt(info?.name || 'file');
  const isImage = IMAGE_TYPES.some(t => mime.startsWith(t));
  const isVideo = VIDEO_TYPES.some(t => mime.startsWith(t));
  const sizeStr = info?.size
    ? info.size < 1024 ? `${info.size} B`
    : info.size < 1024 * 1024 ? `${(info.size / 1024).toFixed(1)} KB`
    : `${(info.size / (1024 * 1024)).toFixed(1)} MB`
    : '';

  if (error) return <div className="text-xs text-red-400">📎 [Failed to load file]</div>;

  if (isImage) {
    return (
      <div className="max-w-[240px]">
        <img src={url} alt={info?.name || 'image'}
          className="rounded-xl max-w-full max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(url, '_blank')}
          loading="lazy"
          onError={() => setError('Failed to load')}
        />
        {info?.name && <div className="text-xs text-gray-400 mt-1 truncate">{info.name}</div>}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="max-w-[260px]">
        <video src={url} controls className="rounded-xl max-w-full max-h-48" preload="metadata" />
        {info?.name && <div className="text-xs text-gray-400 mt-1 truncate">{info.name}</div>}
      </div>
    );
  }

  // Generic file
  const ext = (info?.name || 'file').split('.').pop()?.toUpperCase() || 'FILE';

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 hover:bg-gray-100 transition-colors max-w-[260px] group cursor-pointer">
      <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
        {ext.slice(0, 3)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gray-800 font-medium truncate">{info?.name || cid}</div>
        {sizeStr && <div className="text-xs text-gray-400">{sizeStr}</div>}
      </div>
      <span className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity text-lg">↓</span>
      {/* Download button */}
      <a href={url} download={info?.name || cid}
        className="text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity text-sm font-bold px-2"
        title="Download"
        onClick={(e) => e.stopPropagation()}>
        ↓
      </a>
    </a>
  );
}
