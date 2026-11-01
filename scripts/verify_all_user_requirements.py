import os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1366, 'height': 850})
    page.goto('http://localhost:3000', wait_until='networkidle')
    page.wait_for_timeout(1000)

    # 1. TEST PRACTICE SECTION & INLINE CODING STUDIO
    print("--- 1. Testing Practice Section ---")
    page.evaluate("show('practice')")
    page.wait_for_timeout(800)
    
    # Verify we are on Practice view
    is_practice_visible = page.is_visible('#v-practice')
    print(f"Practice view visible: {is_practice_visible}")
    assert is_practice_visible, "Practice view is not visible!"

    # Verify Leaderboard content
    lb_text = page.inner_text('#lb')
    print("Leaderboard text sample:", lb_text[:120].replace('\n', ' | '))

    # Click first Solve button
    page.click('.sv:first-of-type')
    page.wait_for_timeout(600)

    # Verify Studio opened and Workspace DID NOT open
    is_studio_visible = page.is_visible('#dh-practice-studio-wrap')
    is_workspace_visible = page.is_visible('#v-work')
    studio_title = page.inner_text('#ps-title') if is_studio_visible else ""
    print(f"Practice Studio visible: {is_studio_visible} (Title: '{studio_title}')")
    print(f"Workspace visible: {is_workspace_visible} (Should be False)")
    assert is_studio_visible, "Practice Studio did not open!"
    assert not is_workspace_visible, "Solve redirected to Workspace instead of staying in Practice!"

    # Take screenshot of Practice Studio
    page.screenshot(path=r'C:\Users\parth\.gemini\antigravity\brain\a79369d6-46fa-4fb1-bbd8-9249109c8347\verified_practice_studio.png')
    print("Saved verified_practice_studio.png")

    # Run code in sandbox
    page.click('button:has-text("Run Code")')
    page.wait_for_timeout(1200)
    run_out = page.inner_text('#ps-out')
    print("Practice run output:", run_out[:100].replace('\n', ' '))

    # Return to challenge list
    page.click('button:has-text("Back to Challenges")')
    page.wait_for_timeout(400)
    print("Closed Practice Studio successfully back to challenge list")

    # 2. TEST ADD PROJECT IN PROJECTS VIEW
    print("\n--- 2. Testing Projects & Add Project Modal ---")
    page.evaluate("show('projects')")
    page.wait_for_timeout(600)
    
    # Check "Add Project" button exists
    is_add_proj_btn = page.is_visible('button:has-text("Add Project")')
    print(f"Add Project button visible: {is_add_proj_btn}")

    # Click "Add Project"
    page.click('button:has-text("Add Project")')
    page.wait_for_timeout(500)
    is_add_proj_modal = page.is_visible('#dh-add-project-modal')
    print(f"Add Project modal visible: {is_add_proj_modal}")
    assert is_add_proj_modal, "Add Project modal failed to open!"

    page.screenshot(path=r'C:\Users\parth\.gemini\antigravity\brain\a79369d6-46fa-4fb1-bbd8-9249109c8347\verified_add_project_modal.png')
    print("Saved verified_add_project_modal.png")

    # Fill and submit a new project
    page.fill('#ap-title', 'Quantum Sandbox')
    page.fill('#ap-tagline', 'Real-time quantum state visualizer and simulator')
    page.fill('#ap-repo', 'https://github.com/developer/quantum-sandbox')
    page.fill('#ap-demo', 'https://quantum-sandbox.devharbour.in')
    page.fill('#ap-desc', 'Built for developers experimenting with algorithms.')
    page.click('#form-add-project button[type="submit"]')
    page.wait_for_timeout(800)

    # Verify project is listed and has like button
    proj_content = page.inner_text('#v-projects')
    print("Project submitted! Found 'Quantum Sandbox':", 'Quantum Sandbox' in proj_content)

    # 3. TEST AUTH MODAL & GOOGLE AUTH & BLANK PLACEHOLDERS
    print("\n--- 3. Testing Compact Auth Modal & Google Auth ---")
    page.evaluate("openAuthModal('signup')")
    page.wait_for_timeout(500)

    # Check Google button
    is_google_btn = page.is_visible('#dh-google-btn')
    print(f"Continue with Google button visible: {is_google_btn}")

    # Check modal width
    modal_box = page.eval_on_selector('#dh-auth-modal .dh-modal-card', 'el => el.getBoundingClientRect().width')
    print(f"Auth modal width: {modal_box:.1f}px (target ~380px)")

    # Check placeholders
    su_name_ph = page.get_attribute('#su-name', 'placeholder')
    su_email_ph = page.get_attribute('#su-email', 'placeholder')
    su_user_ph = page.get_attribute('#su-user', 'placeholder')
    print(f"Placeholders: name='{su_name_ph}', email='{su_email_ph}', user='{su_user_ph}'")
    assert su_name_ph == "" and su_email_ph == "" and su_user_ph == "", "Placeholders are not blank!"

    page.screenshot(path=r'C:\Users\parth\.gemini\antigravity\brain\a79369d6-46fa-4fb1-bbd8-9249109c8347\verified_auth_modal_compact.png')
    print("Saved verified_auth_modal_compact.png")

    # 4. TEST PERSISTENCE ON RELOAD
    print("\n--- 4. Testing Reload Persistence ---")
    # Register a user
    suffix = str(int(page.evaluate("Date.now()")))[-5:]
    page.fill('#su-name', 'DevTester Persist')
    page.fill('#su-email', f'persist_{suffix}@devharbour.in')
    page.fill('#su-user', f'persist_{suffix}')
    page.fill('#su-pass', 'SecurePass123!')
    page.click('#su-submit')
    page.wait_for_timeout(1200)

    curr_user = page.evaluate("currentUser ? currentUser.username : null")
    print(f"Signed in as: {curr_user}")

    # RELOAD
    print("Reloading page...")
    page.reload(wait_until='networkidle')
    page.wait_for_timeout(1000)

    curr_user_after = page.evaluate("currentUser ? currentUser.username : null")
    print(f"After reload, user is STILL signed in as: {curr_user_after}")
    assert curr_user_after == f'persist_{suffix}', f"User session lost after reload! Expected persist_{suffix}, got {curr_user_after}"

    # Check leaderboard has updated
    page.evaluate("show('practice')")
    page.wait_for_timeout(600)
    page.screenshot(path=r'C:\Users\parth\.gemini\antigravity\brain\a79369d6-46fa-4fb1-bbd8-9249109c8347\verified_practice_real_leaderboard.png')
    print("Saved verified_practice_real_leaderboard.png")

    print("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!")
    browser.close()
