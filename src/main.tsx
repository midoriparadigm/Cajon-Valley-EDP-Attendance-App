// src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { GuardianLinkPage, releaseTokenFromLocation } from './components/GuardianReleaseForm';

// A guardian's Early Release Form link (…/#release=<token>) opens the form
// itself: no login, and none of the staff app.
const releaseToken = releaseTokenFromLocation();

const root = createRoot(document.getElementById('root')!);
root.render(releaseToken ? <GuardianLinkPage token={releaseToken} /> : <App />);
