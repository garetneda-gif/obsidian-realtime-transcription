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
                thinkingRecordTitle: '录音 / 转写 / 总结',
                thinkingRecordDesc: '1小时音频最快5分钟出稿 • 98%准确率',
                accuracyTip: '*98%数据来源：安徽电子产品监督检验所。',
                thinkingInsightTitle: '洞察与启发',
                thinkingInsightDesc: '风险识别 • 决策建议 • 知识拓展',
                thinkingAssetTitle: '知识资产沉淀',
                thinkingAssetDesc: '可溯源 • 可分享 • 持续复利',
                toolsTitle: '每一场对话<br>都能帮你扩宽思考',
                multilangTitle: '多语种混合识别<br>24种语言自由转译',
                multilangDesc: '支持中英混说、粤普英混说及多种语言识别，会议、课堂、访谈都能稳定转写。',
                askTitle: '有问题，直接问',
                askDesc: '边转写边提问，AI 会结合上下文给出明确回答，并推荐追问方向，帮你快速抓住问题核心。',
                realtimeTitle: '实时洞察<br>给你启发和思考',
                realtimeDesc: 'AI 不止能听懂你说了什么，还能结合照片和批注理解现场信息，给出的见解更贴合实际需求。',
                summaryTitle: '即时丰富的图文纪要',
                summaryDesc: '录音保存后即可生成直观的图文纪要。每条观点都能回看对应原文和录音，复盘更有依据。',
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
                thinkingRecordMetric: '5分钟',
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
                thinkingRecordDesc: 'One-hour audio can become a draft in 5 minutes • 98% accuracy',
                accuracyTip: '*98% based on third-party product testing.',
                thinkingInsightTitle: 'Insights and prompts',
                thinkingInsightDesc: 'Risk detection • decisions • knowledge expansion',
                thinkingAssetTitle: 'Knowledge asset archive',
                thinkingAssetDesc: 'Traceable • shareable • reusable',
                toolsTitle: 'Every conversation<br>can expand your thinking',
                multilangTitle: 'Mixed-language recognition<br>with flexible translation',
                multilangDesc: 'Support for Chinese, English, Japanese, Korean, Cantonese, and mixed-language conversations.',
                askTitle: 'Ask directly',
                askDesc: 'Ask questions while transcribing. AI uses the conversation context to answer and suggest follow-up questions.',
                realtimeTitle: 'Live insight<br>while you listen',
                realtimeDesc: 'AI can combine speech, photos, and annotations to surface useful context and practical suggestions.',
                summaryTitle: 'Rich visual notes instantly',
                summaryDesc: 'After recording, generate visual notes with source text and audio tracebacks, so review stays grounded.',
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
                thinkingRecordMetric: '5 minutes',
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
                thinkingRecordTitle: '錄音 / 轉寫 / 總結',
                thinkingRecordDesc: '1小時音頻最快5分鐘出稿 • 98%準確率',
                accuracyTip: '*98%數據來源：安徽電子產品監督檢驗所。',
                thinkingInsightTitle: '洞察與啟發',
                thinkingInsightDesc: '風險識別 • 決策建議 • 知識拓展',
                thinkingAssetTitle: '知識資產沉澱',
                thinkingAssetDesc: '可溯源 • 可分享 • 持續複利',
                toolsTitle: '每一場對話<br>都能幫你擴寬思考',
                multilangTitle: '多語種混合識別<br>24種語言自由轉譯',
                multilangDesc: '支援中英混說、粵普英混說及多種語言識別，會議、課堂、訪談都能穩定轉寫。',
                askTitle: '有問題，直接問',
                askDesc: '邊轉寫邊提問，AI 會結合上下文給出明確回答，並推薦追問方向，幫你快速抓住問題核心。',
                realtimeTitle: '即時洞察<br>給你啟發和思考',
                realtimeDesc: 'AI 不止能聽懂你說了什麼，還能結合照片和批註理解現場資訊，給出的見解更貼合實際需求。',
                summaryTitle: '即時豐富的圖文紀要',
                summaryDesc: '錄音保存後即可生成直觀的圖文紀要。每條觀點都能回看對應原文和錄音，復盤更有依據。',
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
                thinkingRecordMetric: '5分鐘',
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
