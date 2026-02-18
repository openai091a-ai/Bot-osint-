import os
import asyncio
import aiohttp
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiohttp import web

TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = os.getenv("ADMIN_ID")

bot = Bot(token=TOKEN)
dp = Dispatcher()

def get_main_kb():
    buttons = [
        [InlineKeyboardButton(text="🔎 Search OSINT (Ник)", callback_data="osint_search")],
        [InlineKeyboardButton(text="🌐 Поиск по API (Пример)", callback_data="api_search")],
        [InlineKeyboardButton(text="👨‍💻 Admin", url="https://t.me/zxcswatme")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)

async def check_username(username):
    sites = {
        "Instagram": f"https://www.instagram.com/{username}",
        "TikTok": f"https://www.tiktok.com/@{username}",
        "GitHub": f"https://github.com/{username}",
        "Pinterest": f"https://www.pinterest.com/{username}",
        "VK": f"https://vk.com/{username}"
    }
    found = []
    async with aiohttp.ClientSession() as session:
        for name, url in sites.items():
            try:
                async with session.get(url, timeout=5) as response:
                    if response.status == 200:
                        found.append(f"✅ {name}: {url}")
            except:
                continue
    return found

@dp.message(Command("start"))
async def start_cmd(message: types.Message):
    await message.answer(
        f"Привет, {message.from_user.first_name}! 👋\n\nСистема OSINT запущена и готова к поиску в сети.",
        reply_markup=get_main_kb()
    )

@dp.callback_query(F.data.in_(["osint_search", "api_search"]))
async def search_prompt(callback: types.CallbackQuery):
    await callback.message.answer("Введите никнейм (без @) или ID для анализа:")
    await callback.answer()

@dp.message()
async def handle_all(message: types.Message):
    if not message.text:
        return

    username = message.text.replace("@", "").strip()
    status_msg = await message.answer(f"📡 Запуск сканирования сети для: {username}...")

    # Реальный поиск по сайтам
    found_links = await check_username(username)
    
    # Пример статических данных (имитация базы)
    static_info = (
        f"\n\n📂 Дополнительно (имитация):\n"
        f"👤 Имя: Найдено в утечках\n"
        f"🏘 Город: Ташкент\n"
        f"📱 Тел: +7 (9xx) xxx-xx-xx"
    )

    if found_links:
        links_text = "\n".join(found_links)
        report = f"🔎 Результаты поиска для {username}:\n\n{links_text}{static_info}"
    else:
        report = f"❌ Совпадений для {username} не найдено в открытых источниках.\n{static_info}"

    await status_msg.edit_text(report, disable_web_page_preview=True)

    if ADMIN_ID:
        try:
            await bot.send_message(
                ADMIN_ID, 
                f"🔔 LOG: {message.from_user.full_name} искал {username}\nНайдено ссылок: {len(found_links)}"
            )
        except:
            pass

async def handle(request):
    return web.Response(text="Bot is Live")

async def main():
    app = web.Application()
    app.router.add_get("/", handle)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", int(os.getenv("PORT", 8080)))
    asyncio.create_task(site.start())
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
