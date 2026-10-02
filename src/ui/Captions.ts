import { el } from './dom';

/**
 * Cinematic text: the map-title card when entering a new region, and short
 * "story" lines (route fragments revealed by collected map pieces).
 */
export class Captions {
  private caption: HTMLDivElement;
  private capTitle: HTMLDivElement;
  private capText: HTMLDivElement;
  private story: HTMLDivElement;
  private storyTitle: HTMLDivElement;
  private storyText: HTMLDivElement;
  private capTimer = 0;
  private storyTimer = 0;

  constructor(parent: HTMLElement) {
    this.caption = el('div', 'caption', '', parent);
    this.capTitle = el('div', 'title', '', this.caption);
    el('div', 'rule', '', this.caption);
    this.capText = el('div', 'text', '', this.caption);

    this.story = el('div', 'story', '', parent);
    this.storyTitle = el('div', 'title', '', this.story);
    this.storyText = el('div', 'text', '', this.story);
  }

  showCaption(title: string, text: string, seconds = 5.5): void {
    this.capTitle.textContent = title;
    this.capText.textContent = text;
    this.caption.classList.add('show');
    clearTimeout(this.capTimer);
    this.capTimer = window.setTimeout(() => this.caption.classList.remove('show'), seconds * 1000);
  }

  showStory(title: string, text: string, seconds = 6): void {
    this.storyTitle.textContent = title;
    this.storyText.textContent = text;
    this.story.classList.add('show');
    clearTimeout(this.storyTimer);
    this.storyTimer = window.setTimeout(() => this.story.classList.remove('show'), seconds * 1000);
  }

  clear(): void {
    clearTimeout(this.capTimer);
    clearTimeout(this.storyTimer);
    this.caption.classList.remove('show');
    this.story.classList.remove('show');
  }
}
