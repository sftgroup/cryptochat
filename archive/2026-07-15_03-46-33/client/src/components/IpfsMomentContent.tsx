import { useState, useEffect } from 'react';

interface Props { cid: string; }

export default function IpfsMomentContent({ cid }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/ipfs/file/${cid}`);
        if (!r.ok) throw new Error('not found');
        const ct = r.headers.get('content-type') || '';
        if (ct.startsWith('image/')) {
          const blob = await r.blob();
          if (!cancelled) { setImage(URL.createObjectURL(blob)); setLoading(false); }
        } else {
          const t = await r.text();
          if (!cancelled) { setText(t); setLoading(false); }
        }
      } catch {
        if (!cancelled) { setText('[IPFS content not available]'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [cid]);

  if (loading) return <span className="text-[#536471] italic">Loading...</span>;
  if (image) return <img src={image} alt="moment" className="max-w-full rounded-lg max-h-64 object-cover" />;
  return <span>{text}</span>;
}
