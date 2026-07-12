import { useState, useEffect } from 'react';
import { useConnect, useAccount, useSignMessage } from 'wagmi';
import { getNonce, login } from '../lib/api';

interface Props { onLogin: () => void; }

export default function LoginPage({ onLogin }: Props) {
  const { connectors, connect, isPending } = useConnect();
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMetaMask, setHasMetaMask] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHasMetaMask(!!(window as any).ethereum);
    setReady(true);
  }, []);

  // If wallet already connected, sign and login
  useEffect(() => {
    if (!isConnected || !address || loading) return;
    (async () => {
      setLoading(true);
      try {
        const nonce = await getNonce(address);
        const signature = await signMessageAsync({ message: nonce, account: address as `0x${string}` });
        await login(address, signature);
        onLogin();
      } catch (err: any) {
        if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) {
          setError('You rejected the signature request.');
        } else {
          setError(err?.message?.slice(0, 120) || 'Login failed');
        }
      }
      setLoading(false);
    })();
  }, [isConnected, address]);

  async function handleConnect() {
    setError('');
    const injectedConnector = connectors.find(c => c.id === 'injected' || c.type === 'injected');
    if (!injectedConnector) {
      setHasMetaMask(false);
      return;
    }
    connect({ connector: injectedConnector });
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background:'#f7f9f9'}}>
        <div className="flex items-center gap-3">
          <div style={{width:24,height:24,border:'3px solid #eff3f4',borderTopColor:'#1d9bf0',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
          <span className="text-[#536471] text-[15px] font-medium">Loading CryptChat...</span>
        </div>
      </div>
    );
  }

  const isConnecting = loading || isPending;

  return (
    <div style={{minHeight:'100vh',display:'flex',fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif'}}>
      {/* Left — Brand / Hero Panel */}
      <div style={{flex:1,background:'#0f1419',display:'flex',alignItems:'center',justifyContent:'center',padding:60,position:'relative',overflow:'hidden',minHeight:'100vh'}}>
        <div style={{position:'absolute',top:'-20%',right:'-20%',width:'60%',height:'60%',borderRadius:'50%',background:'radial-gradient(circle,rgba(29,155,240,0.15),transparent 70%)',pointerEvents:'none'}} />
        <div style={{position:'absolute',bottom:'-10%',left:'-10%',width:'40%',height:'40%',borderRadius:'50%',background:'radial-gradient(circle,rgba(120,86,255,0.12),transparent 70%)',pointerEvents:'none'}} />
        
        <div style={{position:'relative',maxWidth:480,width:'100%'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:40}}>
            <div style={{width:56,height:56,borderRadius:16,background:'linear-gradient(135deg,#1d9bf0,#7856ff)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>🔒</div>
            <div>
              <div style={{color:'#fff',fontSize:28,fontWeight:900,letterSpacing:'-0.03em',lineHeight:1}}>CryptChat</div>
              <div style={{color:'#8b98a5',fontSize:13,fontWeight:500,marginTop:4}}>Web3 Encrypted Messaging</div>
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:20,marginBottom:48}}>
            {[
              { icon:'🔐', title:'End-to-End Encrypted', desc:'ECDH + AES-256-GCM. Zero-knowledge architecture.' },
              { icon:'👛', title:'Wallet-as-Identity', desc:'Sign in with MetaMask or any Ethereum wallet.' },
              { icon:'⚡', title:'Zero Gas Fees', desc:'All encryption runs in your browser. No on-chain transactions.' },
            ].map(item => (
              <div key={item.title} style={{display:'flex',gap:14,alignItems:'flex-start'}}>
                <div style={{width:44,height:44,borderRadius:12,background:'rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>{item.icon}</div>
                <div>
                  <div style={{color:'#fff',fontSize:15,fontWeight:700,marginBottom:2}}>{item.title}</div>
                  <div style={{color:'#8b98a5',fontSize:13,lineHeight:1.5}}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{borderTop:'1px solid rgba(255,255,255,0.08)',paddingTop:24}}>
            <div style={{color:'#fff',fontSize:15,fontStyle:'italic',marginBottom:8}}>
              "Finally, a Web3 messenger that actually works. ECDH encryption without the XMTP headaches."
            </div>
            <div style={{color:'#8b98a5',fontSize:12}}>— CryptChat Team</div>
          </div>
        </div>
      </div>

      {/* Right — Login Panel */}
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:60,background:'#fff',minHeight:'100vh'}}>
        <div style={{maxWidth:400,width:'100%'}}>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:700,color:'#1d9bf0',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Get Started</div>
            <h2 style={{fontSize:30,fontWeight:900,color:'#0f1419',letterSpacing:'-0.02em',lineHeight:1.2,marginBottom:8}}>Welcome back</h2>
            <p style={{fontSize:15,color:'#536471',lineHeight:1.5}}>Connect your wallet to access encrypted messages with your friends.</p>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:12,margin:'32px 0'}}>
            <div style={{flex:1,height:1,background:'#eff3f4'}} />
            <span style={{fontSize:12,color:'#8b98a5',fontWeight:500}}>WALLET LOGIN</span>
            <div style={{flex:1,height:1,background:'#eff3f4'}} />
          </div>

          <button
            onClick={handleConnect}
            disabled={isConnecting}
            style={{
              width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:12,
              padding:'16px 24px',borderRadius:16,border:'none',cursor:isConnecting?'not-allowed':'pointer',
              background:isConnecting?'#1a8cd8':'linear-gradient(135deg,#1d9bf0,#7856ff)',
              color:'#fff',fontSize:16,fontWeight:700,
              boxShadow:'0 4px 20px rgba(29,155,240,0.25)',
              transition:'all 0.3s',opacity:isConnecting?0.8:1,
            }}
            onMouseEnter={e => { if(!isConnecting) { e.currentTarget.style.boxShadow = '0 8px 30px rgba(29,155,240,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(29,155,240,0.25)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {isConnecting ? (
              <>
                <span style={{width:20,height:20,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block',animation:'spin 0.7s linear infinite'}} />
                Signing in...
              </>
            ) : hasMetaMask ? (
              <>
                <svg width="22" height="22" viewBox="0 0 28 28" fill="none"><path d="M25.5 2L15.7 9.2l1.8-4.4L25.5 2z" fill="#fff" opacity="0.85"/><path d="M2.5 2l9.7 7.3-1.7-4.5L2.5 2z" fill="#fff" opacity="0.85"/><path d="M21.8 18.5l-2.9 4.5 6.2 1.7 1.8-6L21.8 18.5z" fill="#fff" opacity="0.85"/><path d="M6.2 18.5l-5.1.2 1.8 6 6.2-1.7-2.9-4.5z" fill="#fff" opacity="0.85"/><path d="M12.3 20l-1.6 4.7 5.8.3L15.7 20l-.8-7.3h-1.8l-.8 7.3z" fill="#fff" opacity="0.85"/><path d="M8 11.8l-3.5 5.2 2.2-1.3 2.7-2.3L8 11.8z" fill="#fff" opacity="0.7"/><path d="M20 11.8l-1.4 1.6 2.7 2.3 2.2 1.3-3.5-5.2z" fill="#fff" opacity="0.7"/></svg>
                Connect MetaMask
              </>
            ) : (
              '🔑 Connect Wallet'
            )}
          </button>

          {error && (
            <div style={{marginTop:16,padding:'12px 16px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:12,color:'#dc2626',fontSize:13,lineHeight:1.5}}>
              {error}
            </div>
          )}

          {!hasMetaMask && (
            <div style={{marginTop:20,padding:'16px',background:'#f7f9f9',border:'1px solid #eff3f4',borderRadius:12,textAlign:'center'}}>
              <div style={{fontSize:14,fontWeight:600,color:'#0f1419',marginBottom:6}}>No wallet detected</div>
              <p style={{fontSize:13,color:'#536471',marginBottom:12,lineHeight:1.5}}>
                To use CryptChat, install MetaMask or another Web3 wallet browser extension.
              </p>
              <a href="https://metamask.io" target="_blank"
                style={{display:'inline-block',padding:'8px 20px',background:'#0f1419',color:'#fff',borderRadius:9999,fontSize:13,fontWeight:700,textDecoration:'none'}}>
                Install MetaMask →
              </a>
            </div>
          )}

          <div style={{marginTop:40,textAlign:'center'}}>
            <div style={{fontSize:12,color:'#8b98a5',lineHeight:1.6}}>
              By connecting, you agree to CryptChat's decentralized<br />
              messaging protocol. No data is collected or stored.
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginTop:12}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'#00ba7c'}} />
              <span style={{fontSize:11,color:'#00ba7c',fontWeight:500}}>ECDH P-256 · AES-256-GCM · Zero-Knowledge</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
