import React, { useState } from 'react';
import { useTranslation } from '../i18n';

type Section = 'overview' | 'account' | 'recordings' | 'agent' | 'faq';

export function GuidePage() {
  const { t, lang } = useTranslation();
  const [active, setActive] = useState<Section>('overview');

  const sections: [Section, string][] = [
    ['overview', t('guide.overview')],
    ['account', t('guide.addAccount')],
    ['recordings', t('guide.downloadRecordings')],
    ['agent', t('guide.setupAgent')],
    ['faq', t('guide.faq')],
  ];

  return (
    <div className="page">
      <h2>{t('guide.title')}</h2>

      <div className="guide-layout">
        <div className="guide-nav">
          {sections.map(([key, label]) => (
            <button
              key={key}
              className={`guide-nav-item ${active === key ? 'guide-nav-active' : ''}`}
              onClick={() => setActive(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="guide-content">
          {active === 'overview' && <OverviewSection lang={lang} />}
          {active === 'account' && <AccountSection lang={lang} />}
          {active === 'recordings' && <RecordingsSection lang={lang} />}
          {active === 'agent' && <AgentSection lang={lang} />}
          {active === 'faq' && <FaqSection lang={lang} />}
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ lang }: { lang: string }) {
  if (lang === 'en') return (
    <div className="guide-section">
      <h3>Overview</h3>
      <p>Zoom Recording Downloader helps you manage and download recording files from Zoom Cloud to your computer.</p>
      <div className="guide-steps">
        <Step n={1} title="Add Zoom Account" desc="Connect your Zoom account using Server-to-Server OAuth. Supports multiple accounts." />
        <Step n={2} title="Sync Recordings" desc='Click "Sync All" to fetch recording list from Zoom Cloud. You can schedule auto-sync.' />
        <Step n={3} title="Download" desc="Select recordings to download, choose target device (Server or Agent), click Download." />
        <Step n={4} title="Manage" desc="Track download progress in the Downloads page. Delete recordings from Zoom Cloud when done." />
      </div>
      <div className="guide-info-box">
        <strong>3 ways to use:</strong>
        <ul>
          <li><strong>Desktop App</strong> — Install on your computer, use independently</li>
          <li><strong>Web UI</strong> — Access from browser, manage remotely</li>
          <li><strong>Download Agent</strong> — Run on target machine, receive download commands from Web UI</li>
        </ul>
      </div>
    </div>
  );

  return (
    <div className="guide-section">
      <h3>Tổng Quan</h3>
      <p>Zoom Recording Downloader giúp bạn quản lý và tải file ghi hình từ Zoom Cloud về máy tính.</p>
      <div className="guide-steps">
        <Step n={1} title="Thêm Tài Khoản Zoom" desc="Kết nối tài khoản Zoom bằng Server-to-Server OAuth. Ứng dụng hỗ trợ nhiều tài khoản cùng lúc." />
        <Step n={2} title="Đồng Bộ Bản Ghi" desc='Bấm "Đồng Bộ Tất Cả" để lấy danh sách bản ghi từ Zoom Cloud. Có thể hẹn giờ tự động đồng bộ.' />
        <Step n={3} title="Tải Về" desc="Chọn bản ghi cần tải, chọn thiết bị đích (Server hoặc Agent), bấm Tải Về." />
        <Step n={4} title="Quản Lý" desc="Theo dõi tiến trình tải trong trang Tải Về. Xóa bản ghi khỏi Zoom Cloud khi không cần." />
      </div>
      <div className="guide-info-box">
        <strong>3 cách sử dụng:</strong>
        <ul>
          <li><strong>Desktop App</strong> — Cài đặt trên máy tính, sử dụng độc lập</li>
          <li><strong>Web UI</strong> — Truy cập từ trình duyệt, quản lý từ xa</li>
          <li><strong>Download Agent</strong> — Chạy trên máy đích, nhận lệnh tải từ Web UI</li>
        </ul>
      </div>
    </div>
  );
}

function AccountSection({ lang }: { lang: string }) {
  if (lang === 'en') return (
    <div className="guide-section">
      <h3>How to Add a Zoom Account</h3>
      <p>To connect to Zoom Cloud, you need to create a Server-to-Server OAuth app on Zoom Marketplace.</p>
      <div className="guide-steps">
        <Step n={1} title="Login to Zoom Marketplace" desc={<>Go to <a href="https://marketplace.zoom.us" target="_blank" rel="noopener noreferrer">marketplace.zoom.us</a> and sign in with your Zoom account (Admin or Owner).</>} />
        <Step n={2} title="Create a new App" desc={<>Navigate to <strong>Develop</strong> → <strong>Build App</strong>. Select type: <strong>Server-to-Server OAuth</strong> → Click <strong>Create</strong>. Name your app (e.g., "Recording Downloader").<div className="guide-warning">Important: Choose <strong>Server-to-Server OAuth</strong>, NOT OAuth or JWT.</div></>} />
        <Step n={3} title="Fill in App Information" desc={<>In the <strong>Information</strong> tab: enter App Name, Company Name, Developer Name and Email. Click <strong>Continue</strong>.</>} />
        <Step n={4} title="Copy 3 Important Values" desc={<>In the <strong>App Credentials</strong> tab, copy these 3 values:<Credentials /><div className="guide-warning">Note: Client Secret is shown only once. Save it immediately!</div></>} />
        <Step n={5} title="Add Scopes (Permissions)" desc={<>Go to <strong>Scopes</strong> tab → click <strong>+ Add Scopes</strong>. Add these scopes:<Scopes /></>} />
        <Step n={6} title="Activate the App" desc={<>Go to <strong>Activation</strong> tab → click <strong>Activate your app</strong>. The app status should change to Active.</>} />
        <Step n={7} title="Enter in the Application" desc={<>Go back to Zoom Recording Downloader → <strong>Accounts</strong> page → click <strong>Add Account</strong>. Enter the 3 values from Step 4. Click <strong>Save & Test Connection</strong>.</>} />
      </div>
      <div className="guide-info-box">
        <strong>Tip:</strong> Each Zoom account needs its own app. If you manage multiple Zoom accounts, repeat this process for each one.
      </div>
    </div>
  );

  return (
    <div className="guide-section">
      <h3>Hướng Dẫn Thêm Tài Khoản Zoom</h3>
      <p>Để kết nối với Zoom Cloud, bạn cần tạo một ứng dụng Server-to-Server OAuth trên Zoom Marketplace.</p>
      <div className="guide-steps">
        <Step n={1} title="Đăng nhập Zoom Marketplace" desc={<>Truy cập <a href="https://marketplace.zoom.us" target="_blank" rel="noopener noreferrer">marketplace.zoom.us</a> và đăng nhập bằng tài khoản Zoom (tài khoản Admin hoặc Owner).</>} />
        <Step n={2} title="Tạo App mới" desc={<>Vào menu <strong>Develop</strong> → <strong>Build App</strong>. Chọn loại: <strong>Server-to-Server OAuth</strong> → Bấm <strong>Create</strong>. Đặt tên app bất kỳ, ví dụ: "Recording Downloader".<div className="guide-warning">Lưu ý: Phải chọn đúng loại <strong>Server-to-Server OAuth</strong>, không phải OAuth hoặc JWT.</div></>} />
        <Step n={3} title="Điền thông tin App" desc={<>Trong tab <strong>Information</strong>: điền App Name, Company Name, Developer Name và Email. Bấm <strong>Continue</strong> để sang bước tiếp.</>} />
        <Step n={4} title="Copy 3 thông số quan trọng" desc={<>Trong tab <strong>App Credentials</strong>, copy 3 giá trị sau:<Credentials /><div className="guide-warning">Lưu ý: Client Secret chỉ hiển thị 1 lần. Hãy lưu lại ngay!</div></>} />
        <Step n={5} title="Cấp quyền (Scopes)" desc={<>Vào tab <strong>Scopes</strong> → bấm <strong>+ Add Scopes</strong>. Tìm và thêm các quyền sau:<Scopes /></>} />
        <Step n={6} title="Kích hoạt App" desc={<>Vào tab <strong>Activation</strong> → bấm <strong>Activate your app</strong>. App chuyển sang trạng thái Active là thành công.</>} />
        <Step n={7} title="Nhập vào ứng dụng" desc={<>Quay lại Zoom Recording Downloader → vào trang <strong>Tài Khoản</strong> → bấm <strong>Thêm Tài Khoản</strong>. Điền 3 thông số đã copy ở Bước 4. Bấm <strong>Lưu & Kiểm Tra Kết Nối</strong>.</>} />
      </div>
      <div className="guide-info-box">
        <strong>Mẹo:</strong> Mỗi tài khoản Zoom cần 1 app riêng. Nếu bạn quản lý nhiều tài khoản Zoom, lặp lại quy trình trên cho từng tài khoản.
      </div>
    </div>
  );
}

function RecordingsSection({ lang }: { lang: string }) {
  if (lang === 'en') return (
    <div className="guide-section">
      <h3>Download Recordings</h3>
      <div className="guide-steps">
        <Step n={1} title="Sync Recording List" desc='Go to Recordings page → click "Sync All" (or select a specific account). The app will fetch recordings from Zoom Cloud.' />
        <Step n={2} title="Download Individual Recording" desc="Click Download on a recording → select files to download → choose target device → click Download." />
        <Step n={3} title="Batch Download" desc='Click "Batch Download" → check multiple recordings → choose device → click Download. All files from selected recordings will be queued.' />
        <Step n={4} title="Track Progress" desc="Go to Downloads page to see status, progress %, speed and time remaining. You can Pause / Resume / Cancel / Retry each file." />
      </div>
      <div className="guide-info-box">
        <strong>Auto sync:</strong> Enable "Auto Sync" on the Recordings page to automatically sync and download recordings on a schedule.
      </div>
    </div>
  );

  return (
    <div className="guide-section">
      <h3>Tải Bản Ghi</h3>
      <div className="guide-steps">
        <Step n={1} title="Đồng bộ danh sách" desc='Vào trang Bản Ghi → bấm "Đồng Bộ Tất Cả" (hoặc chọn tài khoản cụ thể). Ứng dụng sẽ lấy danh sách bản ghi từ Zoom Cloud.' />
        <Step n={2} title="Tải từng bản ghi" desc="Bấm Tải Về trên bản ghi cần tải → chọn các file muốn tải (video, audio, chat...) → chọn thiết bị đích → bấm Tải Về." />
        <Step n={3} title="Tải hàng loạt (Batch)" desc='Bấm nút "Tải Hàng Loạt" → tích chọn các bản ghi cần tải → chọn thiết bị → bấm Tải Về. Tất cả file của các bản ghi đã chọn sẽ được đưa vào hàng đợi.' />
        <Step n={4} title="Theo dõi tiến trình" desc="Vào trang Tải Về để xem trạng thái tải, tiến trình %, tốc độ và thời gian còn lại. Có thể Tạm Dừng / Tiếp Tục / Hủy / Thử Lại từng file." />
      </div>
      <div className="guide-info-box">
        <strong>Tự động đồng bộ:</strong> Bật "Tự Động Đồng Bộ" trên trang Bản Ghi để ứng dụng tự động đồng bộ và tải bản ghi theo lịch hẹn.
      </div>
    </div>
  );
}

function AgentSection({ lang }: { lang: string }) {
  if (lang === 'en') return (
    <div className="guide-section">
      <h3>Setup Download Agent</h3>
      <p>The Download Agent lets you download files to a different computer, controlled from the Web UI.</p>
      <div className="guide-steps">
        <Step n={1} title="Download ZoomAgent.exe" desc="Download ZoomAgent.exe from the GitHub Releases page. No need to install Node.js or any other software." />
        <Step n={2} title="Run and Configure" desc={<>Run <strong>ZoomAgent.exe</strong>. On first launch, the browser will open automatically for setup:<ul><li><strong>Device name</strong>: display name on Web UI (e.g., "Office Laptop")</li><li><strong>Download folder</strong>: where to save files (e.g., D:\ZoomRecordings)</li><li><strong>Server URL</strong>: keep default (pre-configured)</li><li><strong>Secret Key</strong>: keep default (pre-configured)</li></ul>Click <strong>Save</strong> → Agent will connect to the server automatically.</>} />
        <Step n={3} title="Usage" desc="Once connected, the device name appears in the Device dropdown on the Web UI. When downloading, select the Agent device instead of Server (local)." />
      </div>
      <div className="guide-info-box">
        <strong>System Tray:</strong> The Agent runs in the system tray (bottom-right corner). Right-click the icon to open settings, open web, or quit.
      </div>
    </div>
  );

  return (
    <div className="guide-section">
      <h3>Cài Đặt Download Agent</h3>
      <p>Download Agent cho phép bạn tải file về một máy tính khác, điều khiển từ Web UI.</p>
      <div className="guide-steps">
        <Step n={1} title="Tải ZoomAgent.exe" desc="Tải file ZoomAgent.exe từ trang GitHub Releases của dự án. Không cần cài đặt Node.js hay bất kỳ phần mềm nào khác." />
        <Step n={2} title="Chạy và cấu hình" desc={<>Chạy file <strong>ZoomAgent.exe</strong>. Lần đầu sẽ tự động mở trình duyệt để cấu hình:<ul><li><strong>Tên thiết bị</strong>: tên hiển thị trên Web UI (VD: "Laptop Văn Phòng")</li><li><strong>Thư mục tải về</strong>: nơi lưu file (VD: D:\ZoomRecordings)</li><li><strong>Server URL</strong>: giữ mặc định (đã cấu hình sẵn)</li><li><strong>Secret Key</strong>: giữ mặc định (đã cấu hình sẵn)</li></ul>Bấm <strong>Lưu Cấu Hình</strong> → Agent sẽ tự động kết nối đến server.</>} />
        <Step n={3} title="Sử dụng" desc="Sau khi Agent kết nối, tên thiết bị sẽ hiện trong danh sách Thiết Bị trên Web UI. Khi tải bản ghi, chọn thiết bị Agent thay vì Server (máy chủ)." />
      </div>
      <div className="guide-info-box">
        <strong>System Tray:</strong> Agent chạy ẩn ở góc phải thanh taskbar. Click phải icon để mở cài đặt, mở web, hoặc thoát.
      </div>
      <div className="guide-info-box">
        <strong>Thay đổi cấu hình:</strong> Mở trình duyệt tại <code>http://127.0.0.1:17710</code> hoặc click phải icon tray → "Mở Cài Đặt".
      </div>
    </div>
  );
}

function FaqSection({ lang }: { lang: string }) {
  const faqs = lang === 'en' ? [
    { q: 'Why are there no recordings after Sync?', a: 'Check the date range filter (From / To). By default, only recordings from the last 30 days are shown. Expand the date range if needed.' },
    { q: '"Invalid credentials" error when adding account?', a: 'Verify that Account ID, Client ID, and Client Secret are correct. Make sure the app on Zoom Marketplace has been Activated.' },
    { q: 'Download is slow or fails?', a: 'Zoom recordings can be very large (several GB). Ensure a stable internet connection. If it fails, go to Downloads and click Retry.' },
    { q: 'Are deleted recordings gone permanently?', a: 'No. The app only moves them to Zoom Trash. You can recover them within 30 days from the Zoom website.' },
    { q: 'Agent cannot connect?', a: 'Check: (1) Server is running, (2) URL is correct, (3) Secret key matches, (4) Firewall is not blocking WebSocket connections.' },
    { q: 'How to update the Agent?', a: 'Open Agent UI (http://127.0.0.1:17710) → click "Check Update". If a new version is available, download the new ZoomAgent.exe and replace the old one.' },
  ] : [
    { q: 'Tại sao không thấy bản ghi sau khi Đồng Bộ?', a: 'Kiểm tra khoảng thời gian lọc (Từ ngày / Đến ngày). Mặc định chỉ hiện bản ghi trong 30 ngày gần nhất. Mở rộng khoảng thời gian nếu cần.' },
    { q: 'Lỗi "Invalid credentials" khi thêm tài khoản?', a: 'Kiểm tra lại Account ID, Client ID, Client Secret đã nhập đúng chưa. Đảm bảo app trên Zoom Marketplace đã được Activate.' },
    { q: 'Tải về chậm hoặc bị lỗi?', a: 'File ghi hình Zoom có thể rất lớn (vài GB). Đảm bảo kết nối internet ổn định. Nếu lỗi, vào trang Tải Về và bấm Thử Lại.' },
    { q: 'Xóa bản ghi có mất vĩnh viễn không?', a: 'Không. Ứng dụng chỉ xóa vào thùng rác của Zoom. Bạn có thể khôi phục trong vòng 30 ngày từ trang web Zoom.' },
    { q: 'Agent không kết nối được?', a: 'Kiểm tra: (1) Server đang chạy, (2) URL đúng, (3) Secret key khớp, (4) Firewall không chặn kết nối WebSocket.' },
    { q: 'Làm sao để cập nhật Agent?', a: 'Mở giao diện Agent (http://127.0.0.1:17710) → bấm "Kiểm Tra Cập Nhật". Nếu có phiên bản mới, tải file ZoomAgent.exe mới thay thế file cũ.' },
  ];

  return (
    <div className="guide-section">
      <h3>{lang === 'en' ? 'Frequently Asked Questions' : 'Câu Hỏi Thường Gặp'}</h3>
      <div className="faq-list">
        {faqs.map((f, i) => (
          <div key={i} className="faq-item">
            <h4>{f.q}</h4>
            <p>{f.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// === Shared Components ===

function Step({ n, title, desc }: { n: number; title: string; desc: React.ReactNode }) {
  return (
    <div className="guide-step">
      <div className="step-number">{n}</div>
      <div className="step-content">
        <h4>{title}</h4>
        <p>{typeof desc === 'string' ? desc : <>{desc}</>}</p>
      </div>
    </div>
  );
}

function Credentials() {
  return (
    <div className="guide-credentials">
      <div className="guide-credential-item">
        <span className="credential-label">Account ID</span>
        <span className="credential-desc">Mã định danh tài khoản Zoom</span>
      </div>
      <div className="guide-credential-item">
        <span className="credential-label">Client ID</span>
        <span className="credential-desc">Mã định danh ứng dụng</span>
      </div>
      <div className="guide-credential-item">
        <span className="credential-label">Client Secret</span>
        <span className="credential-desc">Mật khẩu bí mật (không chia sẻ)</span>
      </div>
    </div>
  );
}

function Scopes() {
  return (
    <div className="guide-scopes">
      <div className="scope-item"><code>cloud_recording:read:list_user_recordings</code><span>Xem danh sách bản ghi</span></div>
      <div className="scope-item"><code>cloud_recording:read:list_recording_files</code><span>Xem chi tiết file</span></div>
      <div className="scope-item"><code>cloud_recording:write:recording</code><span>Xóa bản ghi</span></div>
      <div className="scope-item"><code>user:read:list_users</code><span>Lấy danh sách users</span></div>
    </div>
  );
}
