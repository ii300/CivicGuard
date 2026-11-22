# Apple App Store 最小提审准备

目标是完成可提交的 iPhone/iPad 演练工具。此目录准备文案与操作清单；它不代表已经拥有开发者账号、签名成功、真机验收通过或获得 Apple 审核批准。

产品定位：**CivicGuard Exercise，离线野火通讯演练工具**。它提供内置示意场景、三语草稿、本机保存、审阅状态和演练摘要分享。不要把它描述为实时火情、官方疏散指令、真实预警发送系统或政府应用。无需继续加入账号、AI、推送或更多场景才能完成本轮准备。

## 已准备的材料

| 材料 | 文件 | 使用方法 |
| --- | --- | --- |
| 英文名称、描述、关键词与 URL | [metadata.en-US.json](metadata.en-US.json) | 通过文案长度与事实核对后填入 App Store Connect；名称是否可用以后台为准 |
| 英文审核说明 | [review-notes.en-US.md](review-notes.en-US.md) | 完成对应验证后粘贴到 Notes for Review |
| 公开隐私政策 | [privacy.md](privacy.md) | 页面实际公开可访问后再填写 Privacy Policy URL |
| 公开支持页 | [support.md](support.md) | 真实联系方式是项目维护者的 GitHub issues；私密审核联系人仍需本人提供 |
| 应用内隐私与说明 | 根目录 app-info.js | 随应用打包，离线阅读；它不能替代后台所需的公开政策 URL |

当前准备的公开 URL 指向 `codex/durable-drafts` 分支。**合并并准备长期维护后，将 metadata 中两条 URL 改到稳定 `main`，确认匿名访问成功，再删除分支。** 若分支尚未推送、仓库不公开或文件不存在，这些 URL 还不能用于提审。GitHub 页面可作为最小公开页面，无需额外购买域名。支持入口需由维护者持续查看与响应。

## 无需付费账号可以完成

- [ ] 从本次提交重新构建，记录确切提交编号、CI 运行地址、测试结论和原生构建结果；旧版本构建成功不算本次验收。
- [ ] 验证首次启动断网可用，地图和说明无需下载，控制台没有自动外部请求；主动打开支持或官方链接属于外部浏览器行为。
- [ ] 验证三语编辑、语言与渠道保存、关闭重开、保存失败提示、重置取消/确认及审阅状态失效。
- [ ] 验证原生系统分享、取消分享和 iPad 分享弹出位置；摘要带模拟标签，含全部三语文本与渠道选择，用户可在发送前检查。
- [ ] 在真实 iPhone 和 iPad 验证键盘、旋转、安全区、长文本、离线启动和重新进入；只有浏览器视窗测试时，将真机项明确保留待办。没有付费账号也可在有 Xcode 的 Mac 上使用个人 Apple ID 做有限本机测试，具体能力以 Apple 当前规定为准。
- [ ] 核对应用图标、启动页、名称与构建内隐私清单；App Store 图标应符合 Apple 要求，不使用默认 Capacitor 图标。
- [ ] 从运行中的 iOS 应用/模拟器生成截图，核对文字和当前 UI，不用浏览器画面冒充原生截图。至少准备 Apple 当前要求的 iPhone 截图和支持 iPad 时的 iPad 截图；无透明通道。当前规格页提供 iPhone 1179×2556 / 1206×2622 与 iPad 2064×2752 / 2048×2732 等接受尺寸，提交当天再次核实。
- [ ] 在未登录 GitHub 的浏览器确认支持页、隐私页与 issues 联系入口都可以打开；避免把仅本地文件路径填到后台。
- [ ] 核对第三方许可、数据来源及品牌素材；离线场景使用项目自有示意数据，不宣称真实路线或安置点可用。

## 注册开发者账号后必须完成

- [ ] 注册并启用 Apple Developer Program，确认发布主体与应用权利归属，接受协议；费用和组织登记要求以 [Apple 会员页面](https://developer.apple.com/programs/) 为准。
- [ ] 在 App Store Connect 建立 iOS 应用，确认 Bundle ID 与代码一致、应用名称可用。填写真实开发者身份、版权主体及私密审核联系人姓名、邮箱和电话；这些信息不能从 GitHub 用户名推断。
- [ ] 用属于该团队的证书和描述文件签名、归档、验证并上传 App Store 构建。未签名 `.xcarchive` 和模拟器 `.app` 不能代替商店上传包。
- [ ] 使用提交时 Apple 接受的 Xcode / SDK，检查 App Store Connect 处理结果与隐私清单警告。保留成功上传证据。
- [ ] 在 TestFlight / 真机完成上述最小验收，填写对应结果。审核说明应与上传的确切构建一致。
- [ ] 上传真实截图、确认图标，填写此目录元数据、公开隐私与支持 URL、内容权利、出口合规等后台项目；按应用实际使用的加密和 Apple 问题作答，不凭未签名包自行假定豁免结论。
- [ ] 填写 App Privacy。仅本机存储不属于 Apple 定义的收集；若最终包继续保持零自动网络、无广告/分析/追踪，可据实准备“Data Not Collected”。若加入任何 SDK、远程地图或日志上传，重新核查第三方的数据留存。主动分享与公开 GitHub 支持的处理也应在政策中说明。
- [ ] 完成年龄分级问卷。应用没有广告、赌博、购买、公开用户内容社区或应用内聊天；普通本机文本编辑与系统分享不等于经营社交社区。仍需逐项检查最新问卷和实际画面：本应用涉及火灾主题，但没有伤亡图像；恐惧/暴力等频率应按最终内容和 Apple 定义回答，不预先保证 4+。不选择 Made for Kids，也不宣传面向儿童。
- [ ] 选择价格与发布地区，确认各地区所需合规信息；不能把有中文草稿等同于已完成中国大陆发布手续。按适用地区填写贸易商身份等真实资料，不擅自默认全球发行。
- [ ] 按后台当前要求处理可访问性支持信息；若选择申报，完成相应实测后才声明 VoiceOver、较大文字、增强对比度等支持。语义 HTML、浏览器自动化通过不能替代原生辅助功能测试。
- [ ] 确认 Review notes 里功能、权限、隐私和离线行为准确，提交审核。是否通过仍由 Apple 决定；原生分享不是最低功能条款的自动豁免。

## 审核相关的主要依据

核对日期：2026-10-19。Apple 要求会变化，正式提交时复核官方页面。

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)：1.4 身体安全、1.5 支持联系、2.1 完整性、2.2 测试版、2.3 准确元数据、4.2 最低功能、5.1.1 隐私政策。
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)：仅本机处理与数据收集的区别、第三方责任和公开隐私政策链接。
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)：当前必需设备及尺寸。
- [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)：问卷与地区分级由实际申报决定。
- [Accessibility Nutrition Labels](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels)：辅助功能支持的声明与测试。
