import { initFixPrompt } from '@fixprompt/browser';

initFixPrompt({ key: process.env.REACT_APP_FIXPROMPT_KEY });

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
