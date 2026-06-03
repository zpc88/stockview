import { useState, useEffect, useRef } from 'react';
import { Layout, Typography, Button, Space, Modal, Form, Input, message } from 'antd';
import {
  LogoutOutlined,
  BarChartOutlined,
  SettingOutlined,
  UserOutlined,
  StockOutlined,
  FundOutlined,
  DollarOutlined,
  HolderOutlined,
  TagsOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../services/api';
import IndexBar from '../components/IndexBar';
import UserManagement from '../components/UserManagement';
import { isValidPassword } from '../utils/sanitize';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

interface NavItem {
  key: string;
  icon: React.ReactNode;
  label: string;
}

const defaultNavItems: NavItem[] = [
  { key: '/stocks', icon: <StockOutlined />, label: '持有股票' },
  { key: '/funds', icon: <FundOutlined />, label: '持有基金' },
  { key: '/us-stocks', icon: <DollarOutlined />, label: '美股' },
  { key: '/hk-stocks', icon: <DollarOutlined />, label: '港股' },
  { key: '/investments', icon: <DollarOutlined />, label: '投资' },
  { key: '/market', icon: <BarChartOutlined />, label: '行情' },
  { key: '/tags', icon: <TagsOutlined />, label: '标签' },
];

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [changePwdSaving, setChangePwdSaving] = useState(false);
  const [changePwdForm] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();

  const [navItems, setNavItems] = useState<NavItem[]>(() => {
    const saved = localStorage.getItem('navOrder');
    if (saved) {
      try {
        const order: string[] = JSON.parse(saved);
        // 将已保存的顺序映射到默认项
        const ordered = order
          .map((key) => defaultNavItems.find((item) => item.key === key))
          .filter(Boolean) as NavItem[];
        // 添加新的默认项（如果保存的顺序中没有）
        const newItems = defaultNavItems.filter((item) => !order.includes(item.key));
        return [...ordered, ...newItems];
      } catch {
        return defaultNavItems;
      }
    }
    return defaultNavItems;
  });

  const dragItemRef = useRef<number | null>(null);

  const currentPath = location.pathname.startsWith('/funds')
    ? '/funds'
    : location.pathname.startsWith('/us-stocks')
    ? '/us-stocks'
    : location.pathname.startsWith('/hk-stocks')
    ? '/hk-stocks'
    : location.pathname.startsWith('/investments')
    ? '/investments'
    : location.pathname.startsWith('/market')
    ? '/market'
    : location.pathname.startsWith('/tags')
    ? '/tags'
    : '/stocks';

  useEffect(() => {
    localStorage.setItem('navOrder', JSON.stringify(navItems.map((i) => i.key)));
  }, [navItems]);

  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    const sourceIndex = dragItemRef.current;
    if (sourceIndex !== null && sourceIndex !== targetIndex) {
      setNavItems((prev) => {
        const newItems = [...prev];
        const [removed] = newItems.splice(sourceIndex, 1);
        newItems.splice(targetIndex, 0, removed);
        return newItems;
      });
    }
    dragItemRef.current = null;
  };

  const handleChangePassword = async () => {
    try {
      const values = await changePwdForm.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        message.error('两次输入的密码不一致');
        return;
      }
      setChangePwdSaving(true);
      await authApi.changePassword(values.oldPassword, values.newPassword);
      message.success('密码修改成功');
      setShowChangePwd(false);
      changePwdForm.resetFields();
    } catch (error: any) {
      message.error(error.response?.data?.error || '修改密码失败');
    } finally {
      setChangePwdSaving(false);
    }
  };

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden', background: '#f0f2f5' }}>
      <Header
        style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Title level={4} style={{ margin: 0, color: '#1677ff', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => navigate('/stocks')}>
            <BarChartOutlined /> StockView
          </Title>
          <div style={{ display: 'flex', gap: 4 }}>
            {navItems.map((item, index) => {
              const isActive = currentPath === item.key;
              return (
                <div
                  key={item.key}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                  onClick={() => navigate(item.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 16px',
                    borderRadius: 6,
                    cursor: 'grab',
                    userSelect: 'none',
                    background: isActive ? '#e6f4ff' : 'transparent',
                    color: isActive ? '#1677ff' : '#333',
                    border: isActive ? '1px solid #91caff' : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#f5f5f5';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <HolderOutlined style={{ color: '#bbb', fontSize: 12, cursor: 'grab' }} />
                  {item.icon}
                  <Text strong={isActive} style={{ color: 'inherit', margin: 0 }}>{item.label}</Text>
                </div>
              );
            })}
          </div>
        </div>

        <Space>
          {user?.role === 'ADMIN' && (
            <Button icon={<SettingOutlined />} onClick={() => setShowUserMgmt(true)}>
              用户管理
            </Button>
          )}
          <Button icon={<KeyOutlined />} onClick={() => setShowChangePwd(true)}>改密</Button>
          <Button icon={<UserOutlined />}>{user?.nickname}</Button>
          <Button icon={<LogoutOutlined />} onClick={logout}>退出</Button>
        </Space>
      </Header>

      <Content style={{ padding: '16px 24px', overflow: 'auto', height: 0 }}>
        <IndexBar />
        <Outlet />
      </Content>

      {/* 用户管理弹窗 */}
      <Modal
        title="用户管理"
        open={showUserMgmt}
        onCancel={() => setShowUserMgmt(false)}
        footer={null}
        width={700}
        destroyOnClose
      >
        <UserManagement />
      </Modal>

      {/* 修改密码弹窗 */}
      <Modal
        title="修改密码"
        open={showChangePwd}
        onCancel={() => { setShowChangePwd(false); changePwdForm.resetFields(); }}
        onOk={handleChangePassword}
        confirmLoading={changePwdSaving}
        okText="确认修改"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={changePwdForm} layout="vertical">
          <Form.Item
            name="oldPassword"
            label="原密码"
            rules={[{ required: true, message: '请输入原密码' }]}
          >
            <Input.Password placeholder="请输入原密码" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { validator: (_, val) => isValidPassword(val) ? Promise.resolve() : Promise.reject('6-50个字符，不允许空格和<>') },
            ]}
          >
            <Input.Password placeholder="6-50个字符" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            rules={[{ required: true, message: '请再次输入新密码' }]}
          >
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
