from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1280, 'height': 850})
    page.goto('http://localhost:3000', wait_until='networkidle')
    page.wait_for_timeout(1000)

    # 1. Open Auth modal
    page.evaluate("openAuthModal('signup')")
    page.wait_for_timeout(500)
    page.screenshot(path=r'C:\Users\parth\.gemini\antigravity\brain\a79369d6-46fa-4fb1-bbd8-9249109c8347\signup_modal_blank.png')
    print('1. Captured signup_modal_blank.png - verifying completely blank placeholders')

    # 2. Fill in signup details
    page.fill('#su-name', 'Alex Mercer')
    unique_suffix = str(int(page.evaluate("Date.now()")))[-5:]
    page.fill('#su-email', f'alex_{unique_suffix}@devharbour.in')
    page.fill('#su-user', f'alex_{unique_suffix}')
    page.fill('#su-pass', 'SuperSecretPass123!')
    page.click('#su-submit')
    page.wait_for_timeout(1500)

    # Check localStorage before reload
    current_user_before = page.evaluate("localStorage.getItem('dh_current_user')")
    print('2. User registered & saved in storage:', current_user_before is not None)

    # 3. RELOAD the page (testing "dont forget his acc upon reload")
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(1500)

    # Check session restored after reload
    current_user_after = page.evaluate("currentUser ? currentUser.username : null")
    print('3. After reload, currentUser is:', current_user_after)

    page.screenshot(path=r'C:\Users\parth\.gemini\antigravity\brain\a79369d6-46fa-4fb1-bbd8-9249109c8347\after_reload_session_persisted.png')
    print('4. Captured after_reload_session_persisted.png')

    assert current_user_after is not None, "User session was forgotten upon reload!"
    print('TEST PASSED: User account is NOT forgotten upon reload!')

    browser.close()
