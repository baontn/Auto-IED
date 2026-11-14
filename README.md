# Công cụ IE: Layout Check và IE Báo cáo máy

| Công cụ | Đường dẫn | Phiên bản |
|---|---|---|
| Layout Check | `layout-check/LayoutCheck.html` | V4.3.4 |
| IE Báo cáo máy | `ie-bao-cao-may/IE_BaoCaoMay.html` | v7.9 |

Dữ liệu (layout, MC Report, kế hoạch, thư mục `data` chứa kết quả kiểm tra) **không nằm trong kho này**. Hai công cụ chạy trong Chrome/Edge và chỉ đọc, ghi thư mục do người dùng chọn; không gửi dữ liệu đi đâu.

## Dùng cho cả nhóm

**Cách A, GitHub Pages (mở bằng đường dẫn):**
1. Tạo kho trên GitHub, đẩy toàn bộ thư mục này lên.
2. Settings > Pages > Deploy from a branch > `main` / root > Save.
3. Gửi nhóm đường dẫn `https://<tài khoản>.github.io/<tên kho>/` (trang chủ có hai nút mở công cụ).
4. Lần đầu mở, mỗi người chọn lại các thư mục (trình duyệt ghi nhớ theo địa chỉ trang).
5. Khi có bản mới: nhấn Ctrl+F5.

Lưu ý: gói miễn phí chỉ dùng Pages cho kho công khai; kho riêng tư cần gói trả phí và trang vẫn công khai. Kho chỉ chứa chương trình, không chứa dữ liệu.

**Cách B, kho riêng tư + thư mục chung:** clone kho vào thư mục chung nhóm đang dùng; nhóm mở file HTML từ đó như hiện nay. Cập nhật: bấm đúp `update.bat` (chạy `git pull`), hoặc đặt lịch Windows Task Scheduler.

## Đẩy lần đầu (GitHub Desktop)
1. Cài GitHub Desktop, File > Add local repository (chọn thư mục này) hoặc Create repository.
2. Commit "v7.9", rồi Publish repository (chọn Public hoặc Private theo quy định công ty).
3. Dòng lệnh: `git init`, `git add .`, `git commit -m "v7.9"`, `git branch -M main`, `git remote add origin <url>`, `git push -u origin main`.

## Mỗi lần cập nhật
- IE Báo cáo máy: sửa mã trong `src/ie-bao-cao-may/`, tăng số trong `VERSION`, chạy `python3 tools/build_ie_bao_cao_may.py`.
- Layout Check: sửa trực tiếp `layout-check/LayoutCheck.html`.
- Cập nhật `CHANGELOG.md` và hướng dẫn `manual/*.html` (chụp lại ảnh nếu giao diện đổi: xem `tools/manual_shots/README.md`), Commit, Push. Quay lại bản cũ: History > Revert.

## Không đưa lên GitHub
Thư mục `data`, file `.xlsx/.xlsm`, `.zip`, `.pdf` (đã nằm trong `.gitignore`). Giữ `Linemapping.xlsx` thật trên thư mục chung.

Tài liệu cho Claude Code: xem `CLAUDE.md`.
