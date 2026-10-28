/* Real mobile gameplay capture from the deployed Dad's Arcade.
 * No re-creations: every frame comes from an actual running game in Chromium.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = "https://play.hyperdrive-arcade.workers.dev/";
const OUT = path.resolve("marketing/v3/captured");
fs.mkdirSync(OUT,{recursive:true});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function tapText(page, value) {
  const btn = page.getByRole("button", { name: value, exact: false }).first();
  try {
    if (await btn.count()) {
      await btn.click({timeout:1800});
      return true;
    }
  } catch (e) {}
  return false;
}
async function thumb(page,x,y) {
  await page.mouse.move(x,y);
  await page.mouse.down();
  await sleep(100);
  await page.mouse.up();
}
async function record(browser,key,slug,act) {
  const ctx = await browser.newContext({
    viewport:{width:390,height:844},
    screen:{width:390,height:844},
    deviceScaleFactor:2,
    isMobile:true,
    hasTouch:true,
    reducedMotion:"no-preference",
    recordVideo:{dir:OUT,size:{width:720,height:1280}}
  });
  const page = await ctx.newPage();
  const messages=[];
  page.on("pageerror",e=>messages.push(e.message));
  try {
    await page.goto(BASE+(slug?"?play="+encodeURIComponent(slug):""),{
      waitUntil:"domcontentloaded",timeout:30000
    });
    await page.waitForTimeout(850);
    await act(page);
    await page.waitForTimeout(1600);
    const buttons=await page.locator("button").allTextContents();
    await page.screenshot({path:path.join(OUT,key+".jpg"),type:"jpeg",quality:84});
    fs.writeFileSync(path.join(OUT,key+".json"),JSON.stringify({
      key,buttons:buttons.slice(0,35),errors:messages,url:page.url()
    },null,2));
    console.log(key,"BUTTONS",buttons.slice(0,15).join("|"),"errors",messages.slice(0,3));
  } finally {
    const video = page.video();
    await page.close();
    if(video) await video.saveAs(path.join(OUT,key+".webm"));
    await ctx.close();
  }
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:[
   "--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader"
 ]});
 try {
  await record(browser,"menu",null,async(page)=>{
    await page.waitForTimeout(1800);
    await page.mouse.wheel(0,260);
    await page.waitForTimeout(700);
  });
  await record(browser,"plasma","plasma-sort",async(page)=>{
    await tapText(page,"TODAY'S PUZZLE");
    await page.waitForTimeout(800);
    for (const [x,y] of [[95,370],[280,370],[150,370],[330,370]]) {
      await thumb(page,x,y); await sleep(430);
    }
  });
  await record(browser,"prize","prize-drop",async(page)=>{
    await thumb(page,195,520); await sleep(500);
    for(let i=0;i<7;i++){
      const x=115+(i*61)%175;
      await page.mouse.move(x,560);
      await thumb(page,x,560);
      await sleep(460);
    }
  });
  await record(browser,"letter","letter-lock",async(page)=>{
    await tapText(page,"TODAY'S WORD");
    await page.waitForTimeout(500);
    await page.keyboard.type("CRANE",{delay:80});
    await page.keyboard.press("Enter");
    await page.waitForTimeout(650);
    await page.keyboard.type("SOUND",{delay:65});
  });
  await record(browser,"slime","riley-slime-shop",async(page)=>{
    await tapText(page,"SLIME LAB");
    await page.waitForTimeout(400);
    const bottles=page.locator(".slime-bottle");
    if(await bottles.count()>1){
      await bottles.nth(0).click();await sleep(250);
      await bottles.nth(2).click();await sleep(250);
      await bottles.nth(1).click();await sleep(250);
    }
    await tapText(page,"PLAY WITH IT");
    await page.waitForTimeout(450);
    await page.mouse.move(160,350);await page.mouse.down();
    await page.mouse.move(285,470,{steps:18});await page.mouse.up();
  });
  await record(browser,"voltage","word-voltage",async(page)=>{
    await page.waitForTimeout(1400);
    if(!(await tapText(page,"PLAY DAILY"))){
      if(!(await tapText(page,"PLAY LEVEL"))){
        await tapText(page,"PLAY");
      }
    }
    await page.waitForTimeout(1250);
    await page.mouse.move(195,590);
    await page.mouse.down();
    await page.mouse.move(270,610,{steps:12});
    await page.mouse.move(230,680,{steps:12});
    await page.mouse.up();
  });
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
