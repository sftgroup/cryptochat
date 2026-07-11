import { useState, useEffect } from 'react';
import { authStore } from './lib/api';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hasSession = authStore.loadSession();
    setLoggedIn(hasSession);
    setLoading(false);
  }, []);

  const handleLogin = () => setLoggedIn(true);
  const handleLogout = () => {
    authStore.clear();
    setLoggedIn(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-deep">
        <div className="text-brand animate-pulse text-sm font-mono">Loading...</div>
      </div>
    );
  }

  if (!loggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <ChatPage onLogout={handleLogout} />;
}

export default App;
