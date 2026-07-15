(function(window) {
    'use strict';

    const SITE_TRANSLATIONS = {
        'zh-CN': {
            title: 'Obsidian RealTime Transcriber',
            keywords: 'Obsidian realtime transcriber, Obsidian 语音转文字, 实时转写, AI 会议纪要, 录音转文字',
            description: 'Obsidian RealTime Transcriber 把会议、课堂、访谈和灵感记录实时转写成可检索笔记，支持本地模式与云端 ASR，并可在 Obsidian 工作流中整理和沉淀知识。',
            header: {
                download: '下载',
                downloadCenter: '下载中心',
                enterpriseService: '企业服务',
                gotIt: '我知道了',
                help: '帮助',
                humanPreciseTrans: '人工精转',
                humanPreciseTransDesc: '专业团队，多轮校验',
                login: '登录',
                logout: '退出登录',
                machineFastTrans: '导入文件',
                machineFastTransDesc: '上传文件，快速转写',
                mall: '商城',
                myFiles: '我的文件',
                personalCenter: '个人中心',
                productFeatures: '产品功能',
                realtimeRecording: '实时录音',
                realtimeRecordingDesc: '边录边转，一键成稿',
                recharge: '充值',
                redemptionCenter: '兑换中心',
                solutions: '解决方案',
                accountAbnormal: '账号存在异常'
            },
            privacyPolicy: {
                title: 'Obsidian RealTime Transcriber 用户使用协议和隐私政策',
                cancel: '取消',
                agree: '同意并继续'
            },
            welcome: '欢迎使用 Obsidian RealTime Transcriber',
            companyAdded: '你已被添加至{company}团队，云端转写订单现可通过团队进行支付。',
            learnMore: '了解更多',
            payThroughCompany: '通过团队进行支付',
            payDescription: '绑定团队后，你可在使用云端语音转文字服务时，通过团队账户进行支付。',
            gotIt: '我知道了',
            appTitle: 'Obsidian RealTime Transcriber',
            appDescription: '语音转文字、实时记录、AI 图文纪要',
            downloadNow: '立即下载',
            zwz: {
                heroTitle: '每一场对话<br>都被记录、转写、沉淀',
                heroDesc: '边录边转文字，随时插入照片和添加批注。AI同步理解言外之<br>意，给到风险预判与建议。对话结束即刻生成全面直观的图文<br>纪要，并帮你自动分类存好，成为随时可翻阅的知识积累。',
                primaryCta: '免费体验',
                thinkingTitle: '更懂你的<br>AI语音记录助手',
                thinkingRecordTitle: '实时录音 / 多语转写 / AI 摘要',
                thinkingRecordDesc: '支持 5 种语言 • 直接沉淀到 Obsidian',
                thinkingInsightTitle: '洞察与启发',
                thinkingInsightDesc: '风险识别 • 决策建议 • 知识拓展',
                thinkingAssetTitle: '知识资产沉淀',
                thinkingAssetDesc: '可溯源 • 可分享 • 持续复利',
                toolsTitle: '每一场对话<br>都能帮你扩宽思考',
                multilangTitle: '中英日韩粤语转写<br>识别后按需翻译',
                multilangDesc: '支持中文、英文、日语、韩语和粤语实时转写；识别结果可按需翻译，会议、课堂、访谈直接沉淀到 Obsidian。',
                askTitle: '把转写交给 Claudian',
                askDesc: '一键将当前或勾选的转写挂入 Claudian 上下文，在 Obsidian 内继续追问、整理和分析。',
                realtimeTitle: '实时转写<br>边听边整理',
                realtimeDesc: '语音实时显示在 Obsidian 侧栏，支持分段选择、翻译、润色和复制，重点内容当场整理。',
                summaryTitle: '自动摘要<br>长内容更好回顾',
                summaryDesc: '转写达到设定字数后自动生成摘要，还可将多段摘要合并成综合总结，并复制或导出到笔记。',
                archiveTitle: '沉淀自己的数字资产，随时分享',
                archiveDesc: 'AI 帮你把录音自动分类整理成专属知识库，支持导出 word、txt、链接等格式。',
                ctaTitle: '每一次对话，都值得被完整记录',
                ctaPrimaryCta: '免费体验',
                ctaEnterpriseCta: '企业服务',
                heroVideo: 'AI录音转文字图文纪要界面',
                multilangVisual: '多语种混合识别界面',
                askVisual: '深度洞察界面',
                realtimeVisual: '实时洞察界面',
                summaryVisual: '图文纪要界面',
                archiveVisual: '录音自动分类与分享界面',
                thinkingRecordMetric: '5 语种',
                thinkingInsightMetricAsset: '聪明'
            }
        },
        'en-US': {
            title: 'Obsidian RealTime Transcriber',
            keywords: 'Obsidian realtime transcriber, Obsidian speech to text, live transcription, AI meeting notes, audio to text',
            description: 'Obsidian RealTime Transcriber turns meetings, classes, interviews, and ideas into searchable notes with local mode, cloud ASR, and AI summaries inside your Obsidian workflow.',
            header: {
                download: 'Download',
                downloadCenter: 'Download Center',
                enterpriseService: 'Enterprise',
                gotIt: 'Got it',
                help: 'Help',
                humanPreciseTrans: 'Human Transcription',
                humanPreciseTransDesc: 'Professional review',
                login: 'Log in',
                logout: 'Log out',
                machineFastTrans: 'Import Files',
                machineFastTransDesc: 'Upload and transcribe',
                mall: 'Store',
                myFiles: 'My Files',
                personalCenter: 'Account',
                productFeatures: 'Features',
                realtimeRecording: 'Live Recording',
                realtimeRecordingDesc: 'Record and transcribe',
                recharge: 'Top up',
                redemptionCenter: 'Credits',
                solutions: 'Solutions',
                accountAbnormal: 'Account issue'
            },
            privacyPolicy: {
                title: 'Obsidian RealTime Transcriber Terms and Privacy Policy',
                cancel: 'Cancel',
                agree: 'Agree and continue'
            },
            welcome: 'Welcome to Obsidian RealTime Transcriber',
            companyAdded: 'You have been added to the {company} team. Cloud transcription orders can now be paid by the team.',
            learnMore: 'Learn more',
            payThroughCompany: 'Pay through team',
            payDescription: 'After binding a team, cloud speech-to-text usage can be paid through the team account.',
            gotIt: 'Got it',
            appTitle: 'Obsidian RealTime Transcriber',
            appDescription: 'Speech to text, live capture, and AI visual notes',
            downloadNow: 'Download',
            zwz: {
                heroTitle: 'Every conversation<br>recorded, transcribed, refined',
                heroDesc: 'Transcribe while recording, add photos and notes anytime. AI understands context, flags risks, and turns each conversation into a structured note you can revisit in Obsidian.',
                primaryCta: 'Try free',
                thinkingTitle: 'An AI voice assistant<br>built for your workflow',
                thinkingRecordTitle: 'Record / transcribe / summarize',
                thinkingRecordDesc: '5 languages • Saved in Obsidian',
                thinkingInsightTitle: 'Insights and prompts',
                thinkingInsightDesc: 'Risk detection • decisions • knowledge expansion',
                thinkingAssetTitle: 'Knowledge asset archive',
                thinkingAssetDesc: 'Traceable • shareable • reusable',
                toolsTitle: 'Every conversation<br>can expand your thinking',
                multilangTitle: 'Chinese, English, Japanese,<br>Korean, and Cantonese transcription',
                multilangDesc: 'Transcribe five supported languages in real time, translate results when needed, and keep meetings, classes, and interviews inside Obsidian.',
                askTitle: 'Send transcripts to Claudian',
                askDesc: 'Attach the current or selected transcripts to Claudian as context, then continue asking, organizing, and analyzing inside Obsidian.',
                realtimeTitle: 'Transcribe live<br>and organize as you listen',
                realtimeDesc: 'Speech appears live in the Obsidian sidebar, where segments can be selected, translated, polished, and copied immediately.',
                summaryTitle: 'Automatic summaries<br>for easier review',
                summaryDesc: 'Generate summaries after a configurable amount of text, combine multiple summaries, then copy or export them to your notes.',
                archiveTitle: 'Build your own digital archive and share anytime',
                archiveDesc: 'AI organizes recordings into a personal knowledge base and exports word, txt, or share links.',
                ctaTitle: 'Every conversation deserves a complete record',
                ctaPrimaryCta: 'Try free',
                ctaEnterpriseCta: 'Enterprise',
                heroVideo: 'AI speech-to-note preview',
                multilangVisual: 'Mixed-language recognition preview',
                askVisual: 'Insight assistant preview',
                realtimeVisual: 'Live insight preview',
                summaryVisual: 'Visual notes preview',
                archiveVisual: 'Auto archive and sharing preview',
                thinkingRecordMetric: '5 languages',
                thinkingInsightMetricAsset: 'Smart'
            }
        },
        'zh-TW': {
            title: 'Obsidian RealTime Transcriber',
            keywords: 'Obsidian realtime transcriber, Obsidian 語音轉文字, 即時轉寫, AI 會議紀要, 錄音轉文字',
            description: 'Obsidian RealTime Transcriber 把會議、課堂、訪談和靈感記錄即時轉寫成可檢索筆記，支援本地模式與雲端 ASR，並可在 Obsidian 工作流中整理和沉澱知識。',
            header: {
                download: '下載',
                downloadCenter: '下載中心',
                enterpriseService: '企業服務',
                gotIt: '我知道了',
                help: '幫助',
                humanPreciseTrans: '人工精轉',
                humanPreciseTransDesc: '專業團隊，多輪校驗',
                login: '登入',
                logout: '登出',
                machineFastTrans: '導入文件',
                machineFastTransDesc: '上傳文件，快速轉寫',
                mall: '商城',
                myFiles: '我的文件',
                personalCenter: '個人中心',
                productFeatures: '產品功能',
                realtimeRecording: '即時錄音',
                realtimeRecordingDesc: '邊錄邊轉，一鍵成稿',
                recharge: '充值',
                redemptionCenter: '兌換中心',
                solutions: '解決方案',
                accountAbnormal: '賬號存在異常'
            },
            privacyPolicy: {
                title: 'Obsidian RealTime Transcriber 用戶使用協議和私隱政策',
                cancel: '取消',
                agree: '同意並繼續'
            },
            welcome: '歡迎使用 Obsidian RealTime Transcriber',
            companyAdded: '你已被添加至{company}團隊，雲端轉寫訂單現可通過團隊進行支付。',
            learnMore: '了解更多',
            payThroughCompany: '通過團隊進行支付',
            payDescription: '綁定團隊後，你可在使用雲端語音轉文字服務時，通過團隊賬戶進行支付。',
            gotIt: '我知道了',
            appTitle: 'Obsidian RealTime Transcriber',
            appDescription: '語音轉文字、即時記錄、AI 圖文紀要',
            downloadNow: '立即下載',
            zwz: {
                heroTitle: '每一場對話<br>都被記錄、轉寫、沉澱',
                heroDesc: '邊錄邊轉文字，隨時插入照片和添加批註。AI 同步理解言外之意，給到風險預判與建議。對話結束即刻生成全面直觀的圖文紀要，並幫你自動分類存好。',
                primaryCta: '免費體驗',
                thinkingTitle: '更懂你的<br>AI語音記錄助手',
                thinkingRecordTitle: '即時錄音 / 多語轉寫 / AI 摘要',
                thinkingRecordDesc: '支援 5 種語言 • 直接沉澱到 Obsidian',
                thinkingInsightTitle: '洞察與啟發',
                thinkingInsightDesc: '風險識別 • 決策建議 • 知識拓展',
                thinkingAssetTitle: '知識資產沉澱',
                thinkingAssetDesc: '可溯源 • 可分享 • 持續複利',
                toolsTitle: '每一場對話<br>都能幫你擴寬思考',
                multilangTitle: '中英日韓粵語轉寫<br>識別後按需翻譯',
                multilangDesc: '支援中文、英文、日語、韓語和粵語即時轉寫；識別結果可按需翻譯，會議、課堂、訪談直接沉澱到 Obsidian。',
                askTitle: '把轉寫交給 Claudian',
                askDesc: '一鍵將目前或勾選的轉寫掛入 Claudian 上下文，在 Obsidian 內繼續追問、整理和分析。',
                realtimeTitle: '即時轉寫<br>邊聽邊整理',
                realtimeDesc: '語音即時顯示在 Obsidian 側欄，支援分段選擇、翻譯、潤飾和複製，重點內容當場整理。',
                summaryTitle: '自動摘要<br>長內容更好回顧',
                summaryDesc: '轉寫達到設定字數後自動生成摘要，還可將多段摘要合併成綜合總結，並複製或匯出到筆記。',
                archiveTitle: '沉澱自己的數字資產，隨時分享',
                archiveDesc: 'AI 幫你把錄音自動分類整理成專屬知識庫，支援導出 word、txt、連結等格式。',
                ctaTitle: '每一次對話，都值得被完整記錄',
                ctaPrimaryCta: '免費體驗',
                ctaEnterpriseCta: '企業服務',
                heroVideo: 'AI錄音轉文字圖文紀要界面',
                multilangVisual: '多語種混合識別界面',
                askVisual: '深度洞察界面',
                realtimeVisual: '即時洞察界面',
                summaryVisual: '圖文紀要界面',
                archiveVisual: '錄音自動分類與分享界面',
                thinkingRecordMetric: '5 語種',
                thinkingInsightMetricAsset: '聰明'
            }
        }
    };

    const SUPPORTED_SITE_LANGS = ['zh-CN', 'en-US', 'zh-TW'];

    function getStoredLanguage() {
        try {
            const stored = localStorage.getItem('preferred_language') || localStorage.getItem('i18n_language');
            return SUPPORTED_SITE_LANGS.includes(stored) ? stored : 'zh-CN';
        } catch (error) {
            return 'zh-CN';
        }
    }

    function getValue(source, path) {
        return path.split('.').reduce((value, key) => value && value[key], source);
    }

    function setElementContent(element, value) {
        if (value === null || value === undefined) return;
        if (String(value).includes('<br') || String(value).includes('<span')) {
            element.innerHTML = value;
        } else {
            element.textContent = value;
        }
    }

    function applySiteLanguage(lang) {
        const currentLang = SITE_TRANSLATIONS[lang] ? lang : 'zh-CN';
        const messages = SITE_TRANSLATIONS[currentLang];

        document.documentElement.setAttribute('lang', currentLang);
        document.documentElement.classList.remove('lang-zh-CN', 'lang-en-US', 'lang-zh-TW');
        document.documentElement.classList.add(`lang-${currentLang}`);
        document.querySelector('.zwz2026-page')?.classList.remove('zwz2026-lang-zh-CN', 'zwz2026-lang-en-US', 'zwz2026-lang-zh-TW');
        document.querySelector('.zwz2026-page')?.classList.add(`zwz2026-lang-${currentLang}`);
        document.title = messages.title;
        document.querySelector('meta[name="keywords"]')?.setAttribute('content', messages.keywords);
        document.querySelector('meta[name="description"]')?.setAttribute('content', messages.description);

        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            setElementContent(element, getValue(messages, key));
        });

        document.querySelectorAll('[data-zwz-text]').forEach(element => {
            const key = element.getAttribute('data-zwz-text');
            setElementContent(element, messages.zwz[key]);
        });

        document.querySelectorAll('[data-zwz-alt]').forEach(element => {
            const key = element.getAttribute('data-zwz-alt');
            const value = messages.zwz[key];
            if (value) element.setAttribute('alt', value);
        });

        document.querySelectorAll('[data-zwz-aria]').forEach(element => {
            const key = element.getAttribute('data-zwz-aria');
            const value = messages.zwz[key];
            if (value) element.setAttribute('aria-label', value);
        });

        try {
            localStorage.setItem('preferred_language', currentLang);
            localStorage.setItem('i18n_language', currentLang);
        } catch (error) {}
    }

    if (!window.I18N) {
        window.I18N = {
            currentLang: getStoredLanguage(),
            initialized: true,
            languageReady: true,
            async setLanguage(lang) {
                const nextLang = SITE_TRANSLATIONS[lang] ? lang : 'zh-CN';
                this.currentLang = nextLang;
                applySiteLanguage(nextLang);
                document.dispatchEvent(new Event('languageChanged'));
            }
        };
        applySiteLanguage(window.I18N.currentLang);
        document.dispatchEvent(new Event('languageReady'));
    }

    class LanguageSwitcher {
        constructor(options = {}) {
            // 默认配置
            this.config = {
                container: options.container || null, // 容器选择器，如果为null则添加到body
                position: options.position || 'fixed', // fixed, absolute, relative
                top: options.top || '65px',
                right: options.right || null,
                left: options.left || null,
                zIndex: options.zIndex || 1000,
                languages: options.languages || [
                    { code: 'zh-CN', label: '简体中文', shortLabel: '简' },
                    { code: 'en-US', label: 'English', shortLabel: 'En' },
                    { code: 'zh-TW', label: '繁體中文', shortLabel: '繁' }
                ],
                showArrow: options.showArrow !== false, // 默认显示箭头
                className: options.className || 'language-switcher'
            };

            this.init();
        }

        init() {
            const existingSwitcher = document.querySelector('.J-language-switcher');
            if (existingSwitcher) {
                this.switcher = existingSwitcher;
                this.options = existingSwitcher.querySelector('.language-options');
                this.currentLangSpan = existingSwitcher.querySelector('.language-info-text');
                this.currentLangIcon = existingSwitcher.querySelector('.language-info-icon');
                this.bindHeaderEvents();
                this.updateDisplay();
                document.addEventListener('languageChanged', () => {
                    this.updateDisplay();
                });
                return;
            }

            // 检查是否已存在切换器，避免重复创建
            if (document.querySelector(`.${this.config.className}`)) {
                console.warn('Language switcher already exists');
                return;
            }

            // 创建语言切换按钮
            // this.createSwitcher();

            // 绑定事件
            // this.bindEvents();

            // 初始化显示
            this.updateDisplay();

            // 监听语言变化事件
            document.addEventListener('languageChanged', () => {
                this.updateDisplay();
            });
        }

        bindHeaderEvents() {
            if (!this.switcher || !this.options) return;

            this.switcher.addEventListener('click', (event) => {
                const option = event.target.closest('[data-lang]');
                if (option) {
                    event.stopPropagation();
                    this.switchLanguage(option.getAttribute('data-lang'));
                    this.switcher.classList.remove('open');
                    this.options.classList.remove('show');
                    return;
                }

                event.stopPropagation();
                this.switcher.classList.toggle('open');
                this.options.classList.toggle('show');
            });

            document.addEventListener('click', () => {
                this.switcher.classList.remove('open');
                this.options.classList.remove('show');
            });
        }

        createSwitcher() {
            const switcher = document.createElement('div');
            switcher.className = this.config.className;

            // 设置样式
            this.applyStyles(switcher);

            // 构建语言选项HTML
            const langOptionsHTML = this.config.languages.map(lang =>
                `<li data-lang="${lang.code}">${lang.label}</li>`
            ).join('');

            switcher.innerHTML = `
                <div class="language-select">
                    <div class="selected-lang">
                        <span class="current-lang">中文</span>
                        ${this.config.showArrow ? '<span class="arrow"></span>' : ''}
                    </div>
                    <ul class="lang-options">
                        ${langOptionsHTML}
                    </ul>
                </div>
            `;

            // 添加到指定容器或body
            const container = this.config.container
                ? document.querySelector(this.config.container)
                : document.body;

            if (container) {
                container.appendChild(switcher);
            } else {
                console.error('Container not found:', this.config.container);
                document.body.appendChild(switcher);
            }

            // 保存元素引用
            this.switcher = switcher;
            this.select = switcher.querySelector('.language-select');
            this.selected = switcher.querySelector('.selected-lang');
            this.options = switcher.querySelector('.lang-options');
            this.currentLangSpan = switcher.querySelector('.current-lang');
        }

        applyStyles(switcher) {
            const style = switcher.style;
            style.position = this.config.position;
            if (this.config.top) style.top = this.config.top;
            if (this.config.right) style.right = this.config.right;
            if (this.config.left) style.left = this.config.left;
            style.zIndex = this.config.zIndex;
        }

        bindEvents() {
            // 点击选择框显示/隐藏选项
            this.selected.addEventListener('click', (e) => {
                e.stopPropagation();
                this.options.classList.toggle('show');
            });

            // 点击选项切换语言
            this.options.querySelectorAll('li').forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const lang = option.getAttribute('data-lang');
                    this.switchLanguage(lang);
                    this.options.classList.remove('show');
                });
            });

            // 点击页面其他地方关闭选项
            document.addEventListener('click', () => {
                this.options.classList.remove('show');
            });
        }

        async switchLanguage(lang) {
            try {
                // 只有当语言确实改变时才切换
                if (lang !== I18N.currentLang) {
                    await I18N.setLanguage(lang);
                }
            } catch (error) {
                console.error('Failed to switch language:', error);
            }
        }

        updateDisplay() {
            if (!window.I18N) return;

            const currentLang = I18N.currentLang;

            // 查找当前语言的显示文本
            const currentLangObj = this.config.languages.find(lang => lang.code === currentLang);
            const langText = currentLangObj ? currentLangObj.label : currentLang;

            // 更新当前显示的语言
            if (this.currentLangSpan) {
                this.currentLangSpan.textContent = langText;
            }
            if (this.currentLangIcon && currentLangObj) {
                this.currentLangIcon.textContent = currentLangObj.shortLabel || langText;
            }

            // 更新选项的激活状态
            if (this.options) {
                this.options.querySelectorAll('li').forEach(option => {
                    const lang = option.getAttribute('data-lang');
                    if (lang === currentLang) {
                        option.classList.add('active');
                    } else {
                        option.classList.remove('active');
                    }
                    const primary = option.querySelector('.lang-primary');
                    const secondary = option.querySelector('.lang-secondary');
                    if (primary && option.dataset.labelZh) {
                        primary.textContent = option.dataset[`label${this.labelKey(currentLang)}`] || option.dataset.labelZh;
                    }
                    if (secondary) {
                        secondary.textContent = secondary.dataset[this.secondaryKey(currentLang)] || secondary.textContent;
                    }
                });
            }
        }

        labelKey(lang) {
            if (lang === 'en-US') return 'En';
            if (lang === 'zh-TW') return 'Tw';
            return 'Zh';
        }

        secondaryKey(lang) {
            if (lang === 'en-US') return 'en';
            if (lang === 'zh-TW') return 'tw';
            return 'zh';
        }

        // 销毁切换器
        destroy() {
            if (this.switcher && this.switcher.parentNode) {
                this.switcher.parentNode.removeChild(this.switcher);
            }
        }

        // 更新配置
        updateConfig(newConfig) {
            this.config = { ...this.config, ...newConfig };
            if (this.switcher) {
                this.destroy();
                this.init();
            }
        }
    }

    // 等待 I18N 初始化完成后再初始化语言切换器
    function initializeSwitcher(options) {
        if (window.I18N && window.I18N.initialized) {
            return new LanguageSwitcher(options);
        } else {
            // 如果 I18N 还没有初始化，等待它初始化完成
            let checkI18N = setInterval(() => {
                if (window.I18N && window.I18N.initialized) {
                    clearInterval(checkI18N);
                    return new LanguageSwitcher(options);
                }
                // 超时处理（10秒）
                setTimeout(() => {
                    clearInterval(checkI18N);
                }, 10000);
            }, 100);
        }
    }

    // 暴露到全局，允许外部自定义配置
    window.LanguageSwitcher = LanguageSwitcher;

    // 如果全局配置存在，使用配置初始化
    if (window.I18N_SWITCHER_CONFIG) {
        initializeSwitcher(window.I18N_SWITCHER_CONFIG);
    } else {
        // 默认初始化
        initializeSwitcher();
    }
})(window);
