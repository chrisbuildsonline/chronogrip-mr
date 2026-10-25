import { World } from '@iwsdk/core';
import { APP_TITLE, createWorldOptions } from './config';

const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');

document.title = `${APP_TITLE} MR`;
const heading = document.getElementById('title');
if (heading) heading.textContent = APP_TITLE;

await World.create(container, createWorldOptions());
