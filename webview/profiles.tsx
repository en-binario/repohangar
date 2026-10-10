import { render } from 'preact';
import { ProfilesApp, type ProfilesApi } from './ProfileEditor';
import './styles.css';
import './profiles.css';

declare function acquireVsCodeApi(): ProfilesApi;

const root = document.getElementById('root');
if (root) render(<ProfilesApp api={acquireVsCodeApi()} />, root);
