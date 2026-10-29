import { render } from 'preact';
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/crimson-pro/400.css';
import '@fontsource/crimson-pro/400-italic.css';
import '@fontsource/crimson-pro/600.css';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import './ui/styles.css';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);
