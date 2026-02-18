import os
import asyncio
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

@dp.callback_query(F.data.in_(["osint_search", "api_search"]))
async def search_prompt(callback: types.CallbackQuery):
    await callback.message.answer("Введите @username или ID для анализа:")
    await callback.answer()

@dp.message()
async def handle_search(message: types.Message):
    if not message.text:
        return

    # Отправляем статус
    status_msg = await message.answer("📡 Обработка запроса... ожидайте.")
    
    # Текст отчета (без сложного Markdown, чтобы не было ошибок)
    report = (
        f"🔎 Результат OSINT для: {message.text}\n\n"
        f"👤 Имя: Иван Иванов\n"
        f"🆔 Telegram ID: 123456789\n"
        f"📱 Телефон: +7 (9xx) xxx-xx-xx (GetContact)\n"
        f"📧 Email: ivan***@mail.ru (BurgerKing 2023)\n"
        f"🏘 Город: Ташкент\n"
        f"🔗 Соцсети: Найдено в VK и Instagram\n"
        f"💬 Активность: Чаты: 'Типичный Ташкент', 'Roblox RU'"
    )

    # Имитируем поиск и редактируем сообщение
    await asyncio.sleep(1.5)
    await status_msg.edit_text(report)

    # Лог админу
    if ADMIN_ID:
        try:
            log_text = f"🔔 LOG: {message.from_user.full_name} (@{message.from_user.username}) искал: {message.text}"
            await bot.send_message(ADMIN_ID, log_text)
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
