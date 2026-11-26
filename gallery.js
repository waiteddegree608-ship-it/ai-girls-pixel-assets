'use strict';
const repo = 'https://github.com/waiteddegree608-ship-it/ai-girls-pixel-assets';
const byId = id => document.getElementById(id);
const canvas = byId('frame');
const sheet = byId('sheet');
const select = byId('clip');
const play = byId('mode');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const names = {
  run:'跑步', row:'划船', ride:'乘车', heroWalk:'走路', catWalk:'走路', reach:'开箱',
  cheer:'欢呼', release:'出手', 'in-flight':'飞行', jump:'跳跃', slide:'滑铲', slip:'失衡', recover:'恢复'
};

let cast = [];
let character, asset, sprite, sequence, timer, cursor, paused;

function drawFrame() {
  if (!sprite || !sequence) return;
  const { columns, frameWidth: w, frameHeight: h } = asset.layout;
  const index = sequence.start + cursor;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, (index % columns) * w, Math.floor(index / columns) * h, w, h, 0, 0, w, h);
}

function updatePlayback() {
  clearInterval(timer);
  play.hidden = !sequence || sequence.count <= 1;
  play.textContent = paused ? '播放' : '暂停';
  if (sprite && !play.hidden && !paused && !document.hidden) {
    timer = setInterval(() => {
      cursor = (cursor + 1) % sequence.count;
      drawFrame();
    }, 110);
  }
}

function setClip() {
  const choice = select.selectedOptions[0];
  sequence = choice?.value === 'sheet' ? null :
    choice ? {start:Number(choice.dataset.start), count:Number(choice.dataset.count)} : null;
  cursor = 0;
  paused = reducedMotion.matches;
  sheet.hidden = !!sequence;
  canvas.hidden = !sequence;
  if (sequence) {
    canvas.width = asset.layout.frameWidth;
    canvas.height = asset.layout.frameHeight;
    drawFrame();
  }
  updatePlayback();
}

function showAsset(next) {
  asset = next;
  sprite = null;
  clearInterval(timer);
  const {width, height, layout} = asset;
  const frames = layout.rows * layout.columns;
  byId('asset-title').textContent = asset.label;
  byId('dimensions').textContent = width + ' × ' + height + ' px' +
    (frames > 1 ? '　/　' + frames + ' 帧　/　单帧 ' + layout.frameWidth + ' × ' + layout.frameHeight : '');
  byId('original').href = asset.path;
  byId('original').download = character.id + '-' + asset.id + '.webp';
  byId('stage-char').textContent = character.name;
  sheet.alt = character.name + ' · ' + asset.label;
  canvas.setAttribute('aria-label', sheet.alt);
  select.replaceChildren(new Option('整张原图','sheet'));
  if (frames > 1) {
    const clips = asset.sequences ?? Array.from({length:frames}, (_, i) => ({id:'帧 ' + (i + 1), start:i, count:1}));
    for (const clip of clips) {
      const option = new Option(names[clip.id] ?? clip.id, clip.id);
      option.dataset.start = clip.start;
      option.dataset.count = clip.count;
      select.add(option);
    }
    select.selectedIndex = 1;
  }
  select.hidden = frames <= 1;
  const image = new Image();
  image.onload = () => { if (asset === next) { sprite = image; drawFrame(); updatePlayback(); } };
  image.onerror = () => {
    if (asset !== next) return;
    byId('status').hidden = false;
    byId('status').textContent = '图片加载失败，可以重新选择素材重试。';
  };
  byId('status').hidden = true;
  image.src = asset.path;
  sheet.src = asset.path;
  setClip();
  for (const button of byId('files').children) button.setAttribute('aria-pressed',button.dataset.id === asset.id);
  history.replaceState(null, '', '#' + character.id + '/' + asset.id);
}

function showCharacter(next, assetId) {
  character = next;
  byId('files').replaceChildren();
  for (const entry of character.assets) {
    const button = document.createElement('button');
    button.textContent = entry.label;
    button.dataset.id = entry.id;
    button.onclick = () => showAsset(entry);
    byId('files').append(button);
  }
  for (const button of byId('cast').children) button.setAttribute('aria-pressed',button.dataset.id === character.id);
  const terms = byId('terms');
  const credit = document.createElement('a');
  credit.href = repo + '/blob/main/CREDITS.md';
  credit.textContent = '署名示例';
  terms.replaceChildren(character.id === 'deepseek'
    ? '鲸鱼娘原设：上善无形。角色造型：ZipZipPipe。非商业使用，改编沿用 CC BY-NC-SA 4.0。 '
    : '角色原设：ZipZipPipe。可署名用于非商业二创。 ', credit);
  byId('pack').href = repo + '/releases/latest/download/' + character.id + '.zip';
  showAsset(character.assets.find(a => a.id === assetId) ?? character.assets.find(a => a.id === 'run'));
}

function openHash() {
  const [id, entry] = location.hash.slice(1).split('/');
  showCharacter(cast.find(c => c.id === id) ?? cast[0], entry);
}

select.onchange = setClip;
play.onclick = () => { paused = !paused; updatePlayback(); };
document.addEventListener('visibilitychange', updatePlayback);
reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; updatePlayback(); });

async function start() {
  const response = await fetch('catalog.json');
  if (!response.ok) throw new Error('Catalog unavailable');
  cast = (await response.json()).characters;
  for (const c of cast) {
    const button = document.createElement('button');
    const portrait = document.createElement('img');
    portrait.src = c.assets.find(a => a.id === 'portrait').path;
    portrait.alt = '';
    button.append(portrait, c.name);
    button.dataset.id = c.id;
    button.onclick = () => showCharacter(c);
    byId('cast').append(button);
  }
  openHash();
  byId('workspace').hidden = false;
  window.addEventListener('hashchange', openHash);
}
start().catch(() => {
  byId('status').hidden = false;
  byId('status').textContent = '素材目录加载失败。请刷新页面，或使用上方入口下载整套素材。';
});
