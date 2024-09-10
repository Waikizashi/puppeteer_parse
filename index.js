const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')

const url = process.argv[2]
const regionArgName = process.argv[3]

if (url && regionArgName) {
  scrapeProduct(url, regionArgName)
    .then(() => console.log('Успешный парсинг'))
    .catch(err => console.error('Ошибка:', err))

} else {
  console.log('Пожалуйста, укажите URL и регион.')
}


function sanitizeFilename(filename) {
  return filename.replace(/[\<>:\"\/|?*.]+/g, '');
}

function getRegionDirectoryPath(region) {
  const dirPath = path.join(__dirname, sanitizeFilename(region), '/')

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
    console.log(`Папка для региона '${region}' создана: ${dirPath}`)
  }

  return dirPath
}

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time)
  })
}

async function scrapeProduct(url, region) {
  const regionDirectoryPath = getRegionDirectoryPath(regionArgName)

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: {
      width: 1920,
      height: 1080
    },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const page = await browser.newPage()

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0 Win64 x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')
  await page.goto(url, { waitUntil: 'networkidle0' })

  await page.waitForSelector('[class*="Region_region"]')
  await delay(3000) // Это можно увеличить если браузер тормозит и долльше грузит элементы (смена региона)
  await page.click('[class*="Region_region"]')

  await page.waitForSelector('[class*="UiRegionListBase_list"]')

  await page.evaluate(async (text) => {
    const regionListItems = Array.from(document.querySelectorAll('[class*="UiRegionListBase_item"]'))
    const regionListItem = regionListItems.find(el => el.textContent.includes(text))

    if (regionListItem) {
      await regionListItem.click()
    } else {
      console.log('Регион не найден')
    }
  }, region)


  await page.waitForSelector('[class*="Region_region"]')
  await page.waitForNavigation(url)
  await page.screenshot({ path: `${regionDirectoryPath}screenshot.jpg`, fullPage: true })

  const productInfo = await page.evaluate(() => {
    const cleanNumberOutput = (string) => {
      return string.replace(/[^\d.,]/g, '')
    }

    const priceNewElement = document.querySelector('[class*=PriceInfo_root_]>[class*="Price_price_"]')
    const priceNew = priceNewElement ?
      cleanNumberOutput(priceNewElement.textContent) :
      null

    const priceOldElement = document.querySelector('[class*=PriceInfo_root_]>[class*="PriceInfo_oldPrice_"] span')
    const priceOld = priceOldElement ?
      cleanNumberOutput(priceOldElement.textContent) :
      null

    const ratingText = document.querySelector('[class*="ActionsRow_stars_"]')?.textContent?.trim() || null
    const reviewsCountText = document.querySelector('[class*="ActionsRow_reviews_"]')?.textContent?.trim() || null

    const rating = cleanNumberOutput(ratingText)
    const reviewsCount = cleanNumberOutput(reviewsCountText)

    return {
      priceNew,
      priceOld,
      rating,
      reviewsCount
    }
  })

  const productText = [
    `price: ${productInfo.priceNew || 'none'}`,
    `oldPrice: ${productInfo.priceOld || 'none'}`,
    `rating: ${productInfo.rating || 'none'}`,
    `reviewCount: ${productInfo.reviewsCount || 'none'}`
  ].join('\n')

  fs.writeFileSync(`${regionDirectoryPath}product.txt`, productText.trim())

  await browser.close()
}


