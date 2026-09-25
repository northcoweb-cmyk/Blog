import { initChrome } from './site.js';

initChrome({ active: document.body.dataset.page || '' });
