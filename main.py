import os
import asyncio
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from telethon import TelegramClient
from aiohttp import web

TOKEN = os.getenv("BOT_TOKEN")
API_ID = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")
ADMIN_ID = os.getenv("ADMIN_ID")

bot = Bot(token=TOKEN)
dp = Dispatcher()

def get_main_kb():
    buttons = [
        [InlineKeyboardButton(text="🔎 Search OSINT", callback_data="osint_search")],
        [InlineKeyboardButton(text="🌐 Поиск по API", callback_data="api_search")],
        [InlineKeyboardButton(text="👨‍💻 Admin", url="https://t.me/zxcswatme")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)

@dp.message(Command("start"))
async def start_cmd(message: types.Message):
    await message.answer(
        f"Привет, {message.from_user.first_name}! 👋\n\nСистема OSINT готова.",
        reply_markup=get_main_kb()
    )

@dp.callback_query(F.data == "osint_search")
async def osint_call(callback: types.CallbackQuery):
    await callback.message.answer("Отправьте @username или ID для поиска:")
    await callback.answer()

@dp.callback_query(F.data == "api_search")
async def api_call(callback: types.CallbackQuery):
    await callback.message.answer("Глубокий поиск через App API. Отправьте @username:")
    await callback.answer()

@dp.message()
async def handle_search(message: types.Message):
    if not message.text:
        return

    status = await message.answer("📡 Обработка запроса...")
    
    report = (
        f"🔎 **Результат OSINT для {message.text}:**\n\n"
        f"👤 **Имя:** Иван Иванов\n"
        f"🆔 **Telegram ID:** `123456789`\n"
        f"📱 **Телефон:** +7 (9xx) xxx-xx-xx\n"
        f"📧 **Email:** ivan***@mail.ru\n"
        f"🏘 **Город:** Ташкент\n"
        f"🔗 **Соцсети:** Найдено в VK и Instagram\n"
        f"💬 **Активность:** Состоял в 5 чатах"
    )

    await status.edit_text(report, parse_mode="Markdown")

    if ADMIN_ID:
        log_msg = (
            f"🔔 **LOG: Новый запрос**\n"
            f"👤 От кого: {message.from_user.full_name} (@{message.from_user.username})\n"
            f"🆔 ID юзера: `{message.from_user.id}`\n"
            f"🔍 Искал: `{message.text}`\n\n"
            f"📑 **Выданная инфа:**\n{report}"
        )
        try:
            await bot.send_message(ADMIN_ID, log_msg, parse_mode="Markdown")
        except Exception:
            pass

async def handle(request):
    return web.Response(text="Bot Active")

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
